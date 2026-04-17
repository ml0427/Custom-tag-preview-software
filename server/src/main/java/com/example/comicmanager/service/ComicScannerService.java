package com.example.comicmanager.service;

import com.example.comicmanager.entity.Comic;
import com.example.comicmanager.repository.ComicRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.util.stream.Stream;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class ComicScannerService {

    private static final Logger logger = LoggerFactory.getLogger(ComicScannerService.class);

    @Value("${comic.storage.path}")
    private String storagePath;

    @Autowired
    private ComicRepository comicRepository;

    @Autowired
    private ComicCacheService comicCacheService;

    public int scanComicStorage(String targetPath) {
        logger.info("Manual scan triggered for directory: {}", targetPath);
        Path storageDir = Paths.get(targetPath);
        
        if (!Files.exists(storageDir)) {
            logger.warn("Target path does not exist: {}", targetPath);
            return 0;
        }

        int[] count = new int[1];
        try (Stream<Path> paths = Files.walk(storageDir)) {
            paths.filter(Files::isRegularFile)
                 .filter(path -> path.toString().toLowerCase().endsWith(".zip"))
                 .forEach(path -> {
                     if (processZipFile(path.toFile())) {
                         count[0]++;
                     }
                 });
        } catch (Exception e) {
            logger.error("Error spanning comic storage directory", e);
        }
        return count[0];
    }

    private boolean processZipFile(File zipFile) {
        String filePath = zipFile.getAbsolutePath();
        if (comicRepository.findByFilePath(filePath).isEmpty()) {
            logger.info("Discovered new ZIP comic: {}", filePath);
            Comic comic = new Comic();
            comic.setFilePath(filePath);
            comic.setTitle(zipFile.getName().replace(".zip", ""));
            comic.setImportTime(LocalDateTime.now());
            
            // Save to database
            Comic savedComic = comicRepository.save(comic);
            
            // Trigger async cover extraction
            comicCacheService.extractAndCacheCover(savedComic);
            return true;
        }
        return false;
    }
}
