use super::AppState;
use serde::Serialize;
use std::time::Duration;
use sysinfo::{Pid, Process, ProcessesToUpdate, System};
use tauri::State;

/// Length of one sample. Rate counters need two readings, so each call takes this long and the
/// UI polls it back to back, which gives Task Manager's one-second update rate.
const SAMPLE_WINDOW: Duration = Duration::from_secs(1);

/// Utilization in percent for the hardware the UI charts. `gpu` and `npu` are None when the host
/// has no such device or the counters could not be read.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemUsage {
    pub cpu: f64,
    pub gpu: Option<f64>,
    pub npu: Option<f64>,
    /// Physical memory in use (total minus available), in bytes.
    pub memory_used_bytes: u64,
    /// Total physical memory, in bytes.
    pub memory_total_bytes: u64,
    /// Resident memory of the GenieX server and its child processes, in bytes. None when no server is tracked.
    pub model_memory_bytes: Option<u64>,
}

/// Deepest parent chain walked when deciding whether a process belongs to the server.
const MAX_PROCESS_DEPTH: usize = 32;

/// Sample CPU, GPU, NPU and memory utilization over one window and report the averages.
/// `port` is the GenieX server port. It finds the server when the app did not start it.
#[tauri::command]
pub async fn get_system_usage(state: State<'_, AppState>, port: u16) -> Result<SystemUsage, String> {
    let server_pid = *state
        .server_process
        .lock()
        .map_err(|e| format!("server state unavailable: {e}"))?;
    tokio::task::spawn_blocking(move || sample_usage(server_pid, port))
        .await
        .map_err(|e| format!("system usage probe failed: {e}"))
}

/// The server process: the owner of the listener on `port`, else the one the app started.
pub(super) fn sample_usage(tracked_pid: Option<u32>, port: u16) -> SystemUsage {
    // The process listening on the port is the server that answers requests. The pid the app
    // started can be a launcher that is not in the server's process tree, so it is only the fallback.
    let server_pid = listeners::owner_of_listener(port).or(tracked_pid);
    let mut sys = sysinfo::System::new();
    sys.refresh_cpu_usage();
    let engines = engines::EngineSample::begin();
    std::thread::sleep(SAMPLE_WINDOW);
    sys.refresh_cpu_usage();
    let (gpu, npu) = engines.map_or((None, None), |sample| sample.finish());
    sys.refresh_memory();
    let total = sys.total_memory();
    let model_memory_bytes = server_pid.and_then(|pid| {
        sys.refresh_processes(ProcessesToUpdate::All, true);
        process_tree_memory(&sys, Pid::from_u32(pid))
    });
    SystemUsage {
        cpu: f64::from(sys.global_cpu_usage()),
        gpu,
        npu,
        memory_used_bytes: total.saturating_sub(sys.available_memory()),
        memory_total_bytes: total,
        model_memory_bytes,
    }
}

/// Resident memory of `root` and every process below it, in bytes. None when `root` is not running.
fn process_tree_memory(sys: &System, root: Pid) -> Option<u64> {
    sys.process(root)?;
    let total = sys
        .processes()
        .values()
        .filter(|process| descends_from(sys, process, root))
        .fold(0_u64, |sum, process| sum.saturating_add(process.memory()));
    Some(total)
}

/// Whether `process` is `root` or has it as an ancestor. The walk is bounded, so a pid cycle ends.
fn descends_from(sys: &System, process: &Process, root: Pid) -> bool {
    let mut current = process;
    for _ in 0..MAX_PROCESS_DEPTH {
        if current.pid() == root {
            return true;
        }
        match current.parent().and_then(|parent| sys.process(parent)) {
            Some(parent) => current = parent,
            None => return false,
        }
    }
    false
}

/// Owner of the TCP listener on a port, from the IP Helper table. Windows only.
#[cfg(windows)]
mod listeners {
    use std::ffi::c_void;
    use windows::Win32::NetworkManagement::IpHelper::{
        GetExtendedTcpTable, MIB_TCPROW_OWNER_PID, MIB_TCPTABLE_OWNER_PID,
        TCP_TABLE_OWNER_PID_LISTENER,
    };

    const AF_INET: u32 = 2;
    const ERROR_INSUFFICIENT_BUFFER: u32 = 122;

    /// Process id listening on `port` over IPv4, or None when nothing listens there.
    pub fn owner_of_listener(port: u16) -> Option<u32> {
        let mut size = 0_u32;
        // SAFETY: a null table with a live size out-pointer asks the API for the required size.
        let status = unsafe {
            GetExtendedTcpTable(None, &mut size, false, AF_INET, TCP_TABLE_OWNER_PID_LISTENER, 0)
        };
        if status != ERROR_INSUFFICIENT_BUFFER || size == 0 {
            return None;
        }
        // u32 storage keeps the buffer aligned for the table header.
        let mut buffer = vec![0_u32; (size as usize).div_ceil(4)];
        // SAFETY: `buffer` holds at least `size` bytes, and the API writes the table into it.
        let status = unsafe {
            GetExtendedTcpTable(
                Some(buffer.as_mut_ptr().cast::<c_void>()),
                &mut size,
                false,
                AF_INET,
                TCP_TABLE_OWNER_PID_LISTENER,
                0,
            )
        };
        if status != 0 {
            return None;
        }
        // SAFETY: the API wrote a table header at the start of `buffer`.
        let table = unsafe { &*buffer.as_ptr().cast::<MIB_TCPTABLE_OWNER_PID>() };
        let row_bytes = std::mem::size_of::<MIB_TCPROW_OWNER_PID>();
        let header_bytes = std::mem::size_of::<u32>();
        let max_rows = (size as usize).saturating_sub(header_bytes) / row_bytes;
        let count = (table.dwNumEntries as usize).min(max_rows);
        // SAFETY: `count` rows lie inside the buffer, which the bound above checks.
        let rows = unsafe { std::slice::from_raw_parts(table.table.as_ptr(), count) };
        // The port sits in the low 16 bits in network byte order.
        rows.iter()
            .find(|row| u16::from_be(row.dwLocalPort as u16) == port)
            .map(|row| row.dwOwningPid)
    }
}

/// Non-Windows hosts have no IP Helper table, so the server is only found when the app started it.
#[cfg(not(windows))]
mod listeners {
    pub fn owner_of_listener(_port: u16) -> Option<u32> {
        None
    }
}

/// GPU and NPU utilization from the Windows `GPU Engine` performance counters, the same source
/// Task Manager reads. Each engine instance is named by its adapter LUID and engine type. An
/// adapter whose engines are all `compute` is the NPU; every other adapter counts as a GPU.
#[cfg(windows)]
mod engines {
    use std::collections::HashMap;
    use windows::core::PCWSTR;
    use windows::Win32::System::Performance::{
        PdhAddEnglishCounterW, PdhCloseQuery, PdhCollectQueryData, PdhGetFormattedCounterArrayW,
        PdhOpenQueryW, PDH_FMT_COUNTERVALUE_ITEM_W, PDH_FMT_DOUBLE, PDH_HCOUNTER, PDH_HQUERY,
        PDH_CSTATUS_NEW_DATA, PDH_CSTATUS_VALID_DATA, PDH_MORE_DATA,
    };

    const ENGINE_COUNTER: &str = r"\GPU Engine(*)\Utilization Percentage";

    /// An open query on the engine counter. The query is opened per sample, so engine instances of
    /// processes started during the window are included.
    pub struct EngineSample {
        query: PDH_HQUERY,
        counter: PDH_HCOUNTER,
    }

    impl EngineSample {
        /// Open the query and take the first reading. None when the counter is unavailable.
        pub fn begin() -> Option<Self> {
            let mut query = PDH_HQUERY::default();
            let mut counter = PDH_HCOUNTER::default();
            let path: Vec<u16> = ENGINE_COUNTER.encode_utf16().chain([0]).collect();
            // SAFETY: the out-pointers refer to live locals, and `path` is a NUL-terminated UTF-16 buffer.
            unsafe {
                if PdhOpenQueryW(PCWSTR::null(), 0, &mut query) != 0 {
                    return None;
                }
                if PdhAddEnglishCounterW(query, PCWSTR(path.as_ptr()), 0, &mut counter) != 0 {
                    PdhCloseQuery(query);
                    return None;
                }
                // Rate counters need a reading before the one that is used.
                PdhCollectQueryData(query);
            }
            Some(Self { query, counter })
        }

        /// Take the second reading and return (GPU, NPU) utilization.
        pub fn finish(self) -> (Option<f64>, Option<f64>) {
            // SAFETY: the query and counter were created in `begin` and are closed only in `drop`.
            unsafe {
                if PdhCollectQueryData(self.query) != 0 {
                    return (None, None);
                }
            }
            let items = read_items(self.counter);
            summarize(&items)
        }
    }

    impl Drop for EngineSample {
        fn drop(&mut self) {
            // SAFETY: the handle is valid for the life of this value and is closed exactly once.
            unsafe {
                PdhCloseQuery(self.query);
            }
        }
    }

    /// Read every valid instance as (instance name, percent).
    fn read_items(counter: PDH_HCOUNTER) -> Vec<(String, f64)> {
        let mut buffer_size = 0u32;
        let mut item_count = 0u32;
        // SAFETY: a null buffer asks PDH for the required size; both out-pointers are live locals.
        let status = unsafe {
            PdhGetFormattedCounterArrayW(counter, PDH_FMT_DOUBLE, &mut buffer_size, &mut item_count, None)
        };
        if status != PDH_MORE_DATA {
            return Vec::new();
        }
        let item_size = std::mem::size_of::<PDH_FMT_COUNTERVALUE_ITEM_W>();
        let mut items = vec![PDH_FMT_COUNTERVALUE_ITEM_W::default(); (buffer_size as usize).div_ceil(item_size)];
        // SAFETY: `items` holds at least `buffer_size` bytes; PDH writes names into the same
        // allocation, so they are read before `items` is dropped.
        let status = unsafe {
            PdhGetFormattedCounterArrayW(
                counter,
                PDH_FMT_DOUBLE,
                &mut buffer_size,
                &mut item_count,
                Some(items.as_mut_ptr()),
            )
        };
        if status != 0 {
            return Vec::new();
        }
        items[..item_count as usize]
            .iter()
            .filter(|item| {
                item.FmtValue.CStatus == PDH_CSTATUS_VALID_DATA || item.FmtValue.CStatus == PDH_CSTATUS_NEW_DATA
            })
            .map(|item| {
                // SAFETY: PDH's instance names are NUL-terminated and live in `items`'s allocation.
                let name = unsafe { item.szName.to_string() }.unwrap_or_default();
                // SAFETY: `doubleValue` is the active member because the format is PDH_FMT_DOUBLE.
                let value = unsafe { item.FmtValue.Anonymous.doubleValue };
                (name, value)
            })
            .collect()
    }

    /// Split instance names by adapter and report (GPU, NPU) utilization.
    fn summarize(items: &[(String, f64)]) -> (Option<f64>, Option<f64>) {
        // Adapter LUID -> engine type -> summed utilization.
        let mut adapters: HashMap<&str, HashMap<&str, f64>> = HashMap::new();
        for (name, value) in items {
            let Some((luid, engine)) = parse_instance(name) else {
                continue;
            };
            *adapters.entry(luid).or_default().entry(engine).or_default() += value;
        }

        let mut gpu: Option<f64> = None;
        let mut npu: Option<f64> = None;
        for engines in adapters.values() {
            let util = engines.values().copied().fold(0.0_f64, f64::max).min(100.0);
            let is_npu = engines.keys().all(|engine| engine.to_ascii_lowercase().starts_with("compute"));
            let slot = if is_npu { &mut npu } else { &mut gpu };
            *slot = Some(slot.map_or(util, |current| current.max(util)));
        }
        (gpu, npu)
    }

    /// `pid_1_luid_0x..._0x..._phys_0_eng_0_engtype_3d` -> (`0x..._0x...`, `3d`).
    fn parse_instance(name: &str) -> Option<(&str, &str)> {
        let luid_start = name.find("luid_")? + "luid_".len();
        let luid_end = name[luid_start..].find("_phys_")? + luid_start;
        let engine = name.find("engtype_")? + "engtype_".len();
        Some((&name[luid_start..luid_end], name[engine..].trim()))
    }
}

/// Non-Windows hosts have no engine counters, so GPU and NPU are reported as unavailable.
#[cfg(not(windows))]
mod engines {
    pub struct EngineSample;

    impl EngineSample {
        pub fn begin() -> Option<Self> {
            None
        }

        pub fn finish(self) -> (Option<f64>, Option<f64>) {
            (None, None)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn system_usage_reports_cpu_in_range() {
        let usage = tokio::task::spawn_blocking(|| sample_usage(None, 0))
            .await
            .expect("sample");
        assert!((0.0..=100.0).contains(&usage.cpu));
        assert!(usage.gpu.is_none_or(|v| (0.0..=100.0).contains(&v)));
        assert!(usage.npu.is_none_or(|v| (0.0..=100.0).contains(&v)));
        assert!(usage.memory_used_bytes <= usage.memory_total_bytes);
        assert_eq!(usage.model_memory_bytes, None);
    }

    #[tokio::test]
    async fn model_memory_counts_the_tracked_process_and_its_children() {
        // The test process is its own root, so its resident memory must be reported.
        let usage = tokio::task::spawn_blocking(|| sample_usage(Some(std::process::id()), 0))
            .await
            .expect("sample");
        assert!(usage.model_memory_bytes.is_some_and(|bytes| bytes > 0));
    }

    #[cfg(windows)]
    #[test]
    fn listener_owner_is_this_process() {
        // A listener opened here belongs to the test process, so its port must map back to it.
        let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind");
        let port = listener.local_addr().expect("addr").port();
        assert_eq!(listeners::owner_of_listener(port), Some(std::process::id()));
    }
}

