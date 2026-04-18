package com.example.comicmanager.controller;

import com.example.comicmanager.dto.ComicDto;
import com.example.comicmanager.dto.TagDto;
import com.example.comicmanager.entity.Comic;
import com.example.comicmanager.entity.Tag;
import com.example.comicmanager.repository.ComicRepository;
import com.example.comicmanager.service.ComicScannerService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/comics")
public class ComicController {

    @Autowired
    private ComicRepository comicRepository;

    @Autowired
    private ComicScannerService comicScannerService;

    @PostMapping("/scan")
    public ResponseEntity<?> scanDirectory(@RequestBody Map<String, String> body) {
        String path = body.get("path");
        if (path == null || path.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "The 'path' property is required"));
        }
        int addedCount = comicScannerService.scanComicStorage(path);
        return ResponseEntity.ok(Map.of("message", "Scan completed", "addedCount", addedCount));
    }

    @GetMapping
    public Page<ComicDto> getComics(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) Long tagId) {

        Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "importTime"));
        
        Page<Comic> comicPage;
        if (tagId != null) {
            comicPage = comicRepository.findByTagId(tagId, pageable);
        } else {
            comicPage = comicRepository.findAll(pageable);
        }

        return comicPage.map(this::convertToDto);
    }

    @GetMapping("/{id}")
    public ResponseEntity<ComicDto> getComic(@PathVariable Long id) {
        return comicRepository.findById(id)
                .map(this::convertToDto)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PutMapping("/{id}/rename")
    public ResponseEntity<?> renameComic(@PathVariable Long id, @RequestBody Map<String, String> body) {
        String newTitle = body.get("title");
        if (newTitle == null || newTitle.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "The 'title' property is required"));
        }

        return comicRepository.findById(id).map(comic -> {
            try {
                Path oldPath = Paths.get(comic.getFilePath());
                String fileName = oldPath.getFileName().toString();
                String extension = "";
                int dotIndex = fileName.lastIndexOf('.');
                if (dotIndex > 0) {
                    extension = fileName.substring(dotIndex);
                }

                Path newPath = oldPath.resolveSibling(newTitle + extension);
                
                if (Files.exists(newPath)) {
                    return ResponseEntity.status(409).body(Map.of("error", "A file with the same name already exists: " + newPath.getFileName()));
                }

                Files.move(oldPath, newPath);
                
                comic.setTitle(newTitle);
                comic.setFilePath(newPath.toString());
                
                Comic saved = comicRepository.save(comic);
                return ResponseEntity.ok(convertToDto(saved));
            } catch (Exception e) {
                return ResponseEntity.internalServerError().body(Map.of("error", "Failed to rename file: " + e.getMessage()));
            }
        }).orElse(ResponseEntity.notFound().build());
    }

    private ComicDto convertToDto(Comic comic) {
        ComicDto dto = new ComicDto();
        dto.setId(comic.getId());
        dto.setTitle(comic.getTitle());
        dto.setFilePath(comic.getFilePath());
        dto.setCustomCoverPath(comic.getCustomCoverPath());
        dto.setImportTime(comic.getImportTime());
        dto.setFileSize(comic.getFileSize());
        dto.setFileModifiedTime(comic.getFileModifiedTime());
        
        if (comic.getTags() != null) {
            Set<TagDto> tagDtos = comic.getTags().stream()
                    .map(t -> new TagDto(t.getId(), t.getName()))
                    .collect(Collectors.toSet());
            dto.setTags(tagDtos);
        }
        return dto;
    }
}
