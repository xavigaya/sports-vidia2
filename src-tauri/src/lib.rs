// Aplicació d'escriptori: una finestra amb l'aplicació web compilada (../dist)
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error en arrencar Volei VidIA");
}
