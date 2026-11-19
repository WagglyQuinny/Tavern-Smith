// Prevents an additional console/CMD window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tavernsmith_lib::run()
}
