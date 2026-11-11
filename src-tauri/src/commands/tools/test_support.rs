//! Temporary folders for the tool tests. Each tree gets a unique name and is removed on drop.
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

static NEXT_TREE: AtomicUsize = AtomicUsize::new(0);

pub struct TempTree {
    root: PathBuf,
}

impl TempTree {
    /// A new empty folder under the system temp folder. `label` only helps when a test fails.
    pub fn new(label: &str) -> Self {
        let counter = NEXT_TREE.fetch_add(1, Ordering::SeqCst);
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|elapsed| elapsed.as_nanos())
            .unwrap_or(0);
        let root = std::env::temp_dir().join(format!(
            "localgenie-tools-{label}-{}-{counter}-{nanos}",
            std::process::id()
        ));
        std::fs::create_dir_all(&root).expect("create test folder");
        Self { root }
    }

    pub fn path(&self) -> &Path {
        &self.root
    }

    /// Create a folder at `name` (relative to the tree) and return its path.
    pub fn folder(&self, name: &str) -> PathBuf {
        let path = self.root.join(name);
        std::fs::create_dir_all(&path).expect("create test subfolder");
        path
    }

    /// Write a file at `name` (relative to the tree), creating parent folders, and return its path.
    pub fn file(&self, name: &str, bytes: &[u8]) -> PathBuf {
        let path = self.root.join(name);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).expect("create test parent folder");
        }
        std::fs::write(&path, bytes).expect("write test file");
        path
    }
}

impl Drop for TempTree {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.root);
    }
}
