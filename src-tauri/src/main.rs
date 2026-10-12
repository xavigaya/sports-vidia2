// Evita una finestra de consola addicional a Windows en la versió final
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    sports_vidia_lib::run()
}
