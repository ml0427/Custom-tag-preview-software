package com.example.comicmanager.service;

import com.example.comicmanager.entity.Comic;
import com.example.comicmanager.repository.ComicRepository;
import com.example.comicmanager.repository.TagRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Date;
import java.util.HashSet;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
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

    @Autowired
    private TagRepository tagRepository;

    public int scanComicStorage(String targetPath) {
        logger.info("Manual scan triggered for directory: {}. Clearing database first.", targetPath);
        
        // 1. Clear database and cache
        clearDatabase();
        
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

    private void clearDatabase() {
        logger.warn("DELETING ALL COMICS AND TAGS FROM DATABASE");
        // Maintain referential integrity by deleting Comics first
        comicRepository.deleteAll();
        tagRepository.deleteAll();
        
        // Clear thumbnail cache files
        comicCacheService.clearCache();
        
        logger.info("Database and cache cleared successfully.");
    }

    private boolean processZipFile(File zipFile) {
        String filePath = zipFile.getAbsolutePath();
        java.util.Optional<Comic> existing = comicRepository.findByFilePath(filePath);
        
        if (existing.isEmpty()) {
            logger.info("Discovered new ZIP comic: {}", filePath);
            Comic comic = new Comic();
            comic.setFilePath(filePath);
            comic.setTitle(zipFile.getName().replace(".zip", ""));
            comic.setImportTime(LocalDateTime.now());
            comic.setFileSize(zipFile.length());
            comic.setFileModifiedTime(
                    LocalDateTime.ofInstant(new Date(zipFile.lastModified()).toInstant(), ZoneId.systemDefault()));

            // Auto-tag authors
            extractAndApplyTags(comic);

            // Save to database
            Comic savedComic = comicRepository.save(comic);

            // Trigger async cover extraction
            comicCacheService.extractAndCacheCover(savedComic);
            return true;
        } else {
            // If already exists, check if it needs auto-tagging updates
            Comic comic = existing.get();
            Set<com.example.comicmanager.entity.Tag> existingTags = comic.getTags();
            int originalSize = existingTags.size();
            
            extractAndApplyTags(comic);
            
            // If new tags were actually added, save the update
            if (comic.getTags().size() > originalSize) {
                logger.info("Updated tags for existing record: {}", filePath);
                comicRepository.save(comic);
                return true;
            }
        }
        return false;
    }

    private void extractAndApplyTags(Comic comic) {
        String title = comic.getTitle();
        // Match start of string, optional space, then content in [...] or 【...】
        Pattern bracketPattern = Pattern.compile("^\\s*[\\[【](.*?)[\\]】]");
        Matcher matcher = bracketPattern.matcher(title);
        
        if (matcher.find()) {
            String bracketContent = matcher.group(1);
            logger.info("Found potential author bracket content: '{}' in title: '{}'", bracketContent, title);
            
            // Split by (, ), ,, or full-width equivalents (removing space/\\s to keep names like "3000 krw" intact)
            String[] authorSegments = bracketContent.split("[\\(\\),（）]+");
            
            // Get existing or create new set
            Set<com.example.comicmanager.entity.Tag> tags = comic.getTags();
            if (tags == null) {
                tags = new HashSet<>();
                comic.setTags(tags);
            }

            for (String segment : authorSegments) {
                String cleanName = segment.trim();
                if (cleanName.isEmpty())
                    continue;
                
                logger.info("Extracting auto-tag: {}", cleanName);
                com.example.comicmanager.entity.Tag tag = tagRepository.findByName(cleanName);
                if (tag == null) {
                    tag = new com.example.comicmanager.entity.Tag();
                    tag.setName(cleanName);
                    tag = tagRepository.save(tag);
                }
                tags.add(tag); // Set handles duplicates
            }
        } else {
            logger.debug("No author bracket found in title: {}", title);
        }
    }
}
