use zip::ZipArchive;
use std::fs::File;
use std::io::Read;
use anyhow::Result;

pub fn get_image_entries(zip_path: &str) -> Result<Vec<String>> {
    let file = File::open(zip_path)?;
    let mut archive = ZipArchive::new(file)?;
    let mut entries = Vec::new();

    for i in 0..archive.len() {
        let file = archive.by_index(i)?;
        if file.is_file() && is_image_file(file.name()) {
            entries.push(file.name().to_string());
        }
    }
    entries.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
    Ok(entries)
}

pub fn extract_image(zip_path: &str, image_name: &str) -> Result<Vec<u8>> {
    let file = File::open(zip_path)?;
    let mut archive = ZipArchive::new(file)?;
    let mut entry = archive.by_name(image_name)?;
    let mut buffer = Vec::new();
    entry.read_to_end(&mut buffer)?;
    Ok(buffer)
}

fn is_image_file(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower.ends_with(".jpg") || lower.ends_with(".jpeg") || 
    lower.ends_with(".png") || lower.ends_with(".gif") || 
    lower.ends_with(".webp")
}
