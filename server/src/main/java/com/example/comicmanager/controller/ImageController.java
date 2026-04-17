package com.example.comicmanager.controller;

import com.example.comicmanager.entity.Comic;
import com.example.comicmanager.repository.ComicRepository;
import com.example.comicmanager.service.ComicCacheService;
import com.example.comicmanager.service.ZipService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/comics")
public class ImageController {

    @Autowired
    private ComicRepository comicRepository;

    @Autowired
    private ZipService zipService;

    @Autowired
    private ComicCacheService comicCacheService;

    @Value("${comic.cache.path}")
    private String cachePath;

    @GetMapping("/{id}/cover")
    public ResponseEntity<Resource> getComicCover(@PathVariable Long id) {
        try {
            Path file = Paths.get(cachePath).resolve(id + ".jpg").normalize();
            Resource resource = new UrlResource(file.toUri());

            if (resource.exists() || resource.isReadable()) {
                return ResponseEntity.ok()
                        .header(HttpHeaders.CONTENT_TYPE, MediaType.IMAGE_JPEG_VALUE)
                        .body(resource);
            } else {
                return ResponseEntity.notFound().build();
            }
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    @GetMapping("/{id}/images")
    public ResponseEntity<List<String>> getComicImages(@PathVariable Long id) {
        Optional<Comic> comicOpt = comicRepository.findById(id);
        if (comicOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        try {
            List<String> images = zipService.getImageEntries(comicOpt.get().getFilePath());
            images.sort(String::compareToIgnoreCase);
            return ResponseEntity.ok(images);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    @PostMapping("/{id}/cover")
    public ResponseEntity<Void> setCustomCover(@PathVariable Long id, @RequestBody Map<String, String> body) {
        Optional<Comic> comicOpt = comicRepository.findById(id);
        if (comicOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        String imagePath = body.get("imagePath");
        if (imagePath == null || imagePath.isEmpty()) {
            return ResponseEntity.badRequest().build();
        }

        Comic comic = comicOpt.get();
        comic.setCustomCoverPath(imagePath);
        comicRepository.save(comic);

        // Re-extract cover
        comicCacheService.extractAndCacheCover(comic);

        return ResponseEntity.ok().build();
    }
}
