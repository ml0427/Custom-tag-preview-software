use anyhow::{Context, Result};
use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use image::GenericImageView;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use tempfile::NamedTempFile;

const THUMBNAIL_MAX_WIDTH: u32 = 320;
const JPEG_QUALITY: u8 = 82;

pub struct ThumbnailCacheWrite {
    pub path: PathBuf,
    pub bytes: usize,
}

pub fn cache_path(cache_dir: &Path, id: i64) -> PathBuf {
    cache_dir.join(format!("{}.jpg", id))
}

pub fn is_valid_cache_file(cache_file: &Path) -> bool {
    let Ok(data) = fs::read(cache_file) else {
        return false;
    };
    if !data.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return false;
    }
    image::load_from_memory(&data)
        .map(|image| image.dimensions().0 <= THUMBNAIL_MAX_WIDTH)
        .unwrap_or(false)
}

pub fn write_thumbnail_cache(
    cache_dir: &Path,
    id: i64,
    source_image: &[u8],
) -> Result<ThumbnailCacheWrite> {
    fs::create_dir_all(cache_dir)?;
    let cache_file = cache_path(cache_dir, id);
    let encoded = encode_thumbnail_jpeg(source_image)?;

    let mut tmp = NamedTempFile::new_in(cache_dir)?;
    tmp.write_all(&encoded)?;
    tmp.flush()?;
    tmp.persist(&cache_file)
        .map_err(|error| error.error)
        .with_context(|| format!("failed to persist thumbnail cache {}", cache_file.display()))?;

    Ok(ThumbnailCacheWrite {
        path: cache_file,
        bytes: encoded.len(),
    })
}

fn encode_thumbnail_jpeg(source_image: &[u8]) -> Result<Vec<u8>> {
    let image =
        image::load_from_memory(source_image).context("failed to decode thumbnail source")?;
    let (width, height) = image.dimensions();
    let thumbnail = if width > THUMBNAIL_MAX_WIDTH {
        let target_height =
            ((height as f64 * THUMBNAIL_MAX_WIDTH as f64 / width as f64).round() as u32).max(1);
        image.resize(THUMBNAIL_MAX_WIDTH, target_height, FilterType::Lanczos3)
    } else {
        image
    };

    let rgb = thumbnail.to_rgb8();
    let mut encoded = Vec::new();
    JpegEncoder::new_with_quality(&mut encoded, JPEG_QUALITY).encode_image(&rgb)?;
    Ok(encoded)
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{DynamicImage, ImageBuffer, ImageFormat, Rgba};
    use std::io::Cursor;
    use tempfile::tempdir;

    fn png_bytes(width: u32, height: u32) -> Vec<u8> {
        let image = ImageBuffer::from_pixel(width, height, Rgba([120, 80, 40, 255]));
        let mut data = Vec::new();
        DynamicImage::ImageRgba8(image)
            .write_to(&mut Cursor::new(&mut data), ImageFormat::Png)
            .unwrap();
        data
    }

    #[test]
    fn write_thumbnail_cache_resizes_and_encodes_jpeg() {
        let dir = tempdir().unwrap();
        let source = png_bytes(1200, 800);

        let written = write_thumbnail_cache(dir.path(), 42, &source).unwrap();

        assert_eq!(written.path, dir.path().join("42.jpg"));
        assert!(written.bytes < source.len());
        let cached = fs::read(written.path).unwrap();
        assert!(cached.starts_with(&[0xFF, 0xD8, 0xFF]));
        let decoded = image::load_from_memory(&cached).unwrap();
        assert_eq!(decoded.dimensions().0, THUMBNAIL_MAX_WIDTH);
        assert_eq!(decoded.dimensions().1, 213);
    }

    #[test]
    fn is_valid_cache_file_rejects_non_jpeg_and_oversized_jpeg() {
        let dir = tempdir().unwrap();
        let png_path = dir.path().join("1.jpg");
        fs::write(&png_path, png_bytes(100, 100)).unwrap();
        assert!(!is_valid_cache_file(&png_path));

        let wide_path = write_thumbnail_cache(dir.path(), 2, &png_bytes(640, 480))
            .unwrap()
            .path;
        assert!(is_valid_cache_file(&wide_path));
    }

    #[test]
    fn write_thumbnail_cache_replaces_existing_file() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("7.jpg"), b"old raw bytes").unwrap();

        let written = write_thumbnail_cache(dir.path(), 7, &png_bytes(80, 80)).unwrap();

        let cached = fs::read(written.path).unwrap();
        assert!(cached.starts_with(&[0xFF, 0xD8, 0xFF]));
        assert!(is_valid_cache_file(&dir.path().join("7.jpg")));
    }
}
