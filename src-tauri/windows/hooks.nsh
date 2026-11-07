; LocalGenie NSIS installer hooks.
; Referenced from tauri.conf.json > bundle.windows.nsis.installerHooks.
; Only the uninstall cleanup is custom. Install and postinstall use the Tauri defaults.

!macro NSIS_HOOK_PREUNINSTALL
  ; Runs first in Section Uninstall, BEFORE the built-in "app is running" check,
  ; so the app and its child processes must be stopped here or that check fails.
  ; When the updater runs the old uninstaller with /UPDATE, skip all of this:
  ; the update must keep the user's data and must not kill a half-updated app.
  ${If} $UpdateMode <> 1

    ; (a) Stop the app and everything it started (T = include child processes).
    ; Exit codes are ignored: taskkill returns non-zero when the process is not running.
    nsExec::Exec 'taskkill /F /T /IM "${MAINBINARYNAME}.exe"'
    Pop $0
    ; Best effort: stop the GenieX server/CLI if it is still running. Not fatal if absent.
    nsExec::Exec 'taskkill /F /IM geniex.exe'
    Pop $0

    ; (b) Ask the app binary to clean up its own state (GenieX server, model
    ; registrations, runtime files). If the binary is already gone, ExecWait
    ; just sets an error flag and the uninstall carries on.
    ; $DeleteAppDataCheckboxState is 1 when the user ticked "Delete the application data"
    ; on the uninstall confirm page. Silent uninstalls (/S) never show that page,
    ; so the variable stays 0 and data is kept.
    ${If} $DeleteAppDataCheckboxState = 1
      ExecWait '"$INSTDIR\${MAINBINARYNAME}.exe" --uninstall-cleanup --delete-data' $0
    ${Else}
      ExecWait '"$INSTDIR\${MAINBINARYNAME}.exe" --uninstall-cleanup' $0
    ${EndIf}
    ; Report only. The uninstaller continues whatever the exit code is,
    ; so a failed cleanup never leaves the app half-removed.
    DetailPrint "LocalGenie uninstall cleanup exit code: $0"

  ${EndIf}
!macroend
