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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;
    use tempfile::tempdir;
    use zip::write::SimpleFileOptions;

    fn create_zip(path: &std::path::Path) {
        let file = File::create(path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let options = SimpleFileOptions::default();

        zip.start_file("pages/02.PNG", options).unwrap();
        zip.write_all(b"second").unwrap();
        zip.start_file("pages/01.jpg", options).unwrap();
        zip.write_all(b"first").unwrap();
        zip.start_file("notes.txt", options).unwrap();
        zip.write_all(b"not an image").unwrap();
        zip.finish().unwrap();
    }

    #[test]
    fn get_image_entries_returns_sorted_supported_images_only() {
        let dir = tempdir().unwrap();
        let zip_path = dir.path().join("book.zip");
        create_zip(&zip_path);

        let entries = get_image_entries(zip_path.to_str().unwrap()).unwrap();

        assert_eq!(entries, vec!["pages/01.jpg", "pages/02.PNG"]);
    }

    #[test]
    fn extract_image_reads_entry_bytes() {
        let dir = tempdir().unwrap();
        let zip_path = dir.path().join("book.zip");
        create_zip(&zip_path);

        let bytes = extract_image(zip_path.to_str().unwrap(), "pages/01.jpg").unwrap();

        assert_eq!(bytes, b"first");
    }

    #[test]
    fn invalid_zip_returns_error() {
        let dir = tempdir().unwrap();
        let zip_path = dir.path().join("broken.zip");
        fs::write(&zip_path, b"plain text").unwrap();

        assert!(get_image_entries(zip_path.to_str().unwrap()).is_err());
    }
}
