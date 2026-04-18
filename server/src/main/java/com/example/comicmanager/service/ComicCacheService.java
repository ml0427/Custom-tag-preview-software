package com.example.comicmanager.service;

import com.example.comicmanager.entity.Comic;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;

@Service
public class ComicCacheService {

    private static final Logger logger = LoggerFactory.getLogger(ComicCacheService.class);

    @Value("${comic.cache.path}")
    private String cachePath;

    @Autowired
    private ZipService zipService;

    @Async
    public void extractAndCacheCover(Comic comic) {
        try {
            Path cacheDir = Paths.get(cachePath);
            if (!Files.exists(cacheDir)) {
                Files.createDirectories(cacheDir);
            }

            File zipFile = new File(comic.getFilePath());
            if (!zipFile.exists()) {
                logger.warn("ZIP file not found: {}", comic.getFilePath());
                return;
            }

            String targetImageEntry = comic.getCustomCoverPath();
            
            // If there's no custom cover, fetch the first image
            if (targetImageEntry == null || targetImageEntry.isEmpty()) {
                List<String> images = zipService.getImageEntries(comic.getFilePath());
                if (images.isEmpty()) {
                    logger.warn("No images found in ZIP: {}", comic.getFilePath());
                    return;
                }
                // Use the first image as the default cover
                images.sort(String::compareToIgnoreCase);
                targetImageEntry = images.get(0);
            }

            byte[] imageData = zipService.extractImage(comic.getFilePath(), targetImageEntry);
            if (imageData != null) {
                // Save to cache directory as {comic.getId()}.jpg
                Path cacheFilePath = cacheDir.resolve(comic.getId() + ".jpg");
                Files.write(cacheFilePath, imageData);
                logger.info("Cached cover for comic {}: {}", comic.getId(), cacheFilePath);
            } else {
                logger.warn("Failed to extract image {} from ZIP: {}", targetImageEntry, comic.getFilePath());
            }

        } catch (Exception e) {
            logger.error("Error extracting cover for comic {}: {}", comic.getId(), e.getMessage());
        }
    }

    public void clearCache() {
        try {
            Path cacheDir = Paths.get(cachePath);
            if (Files.exists(cacheDir)) {
                File[] files = cacheDir.toFile().listFiles();
                if (files != null) {
                    for (File file : files) {
                        if (file.isFile()) {
                            file.delete();
                        }
                    }
                }
                logger.info("Thumbnails cache cleared.");
            }
        } catch (Exception e) {
            logger.error("Error clearing thumbnail cache: {}", e.getMessage());
        }
    }
}
