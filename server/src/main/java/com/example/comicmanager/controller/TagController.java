package com.example.comicmanager.controller;

import com.example.comicmanager.dto.TagDto;
import com.example.comicmanager.entity.Comic;
import com.example.comicmanager.entity.Tag;
import com.example.comicmanager.repository.ComicRepository;
import com.example.comicmanager.repository.TagRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api")
public class TagController {

    @Autowired
    private TagRepository tagRepository;

    @Autowired
    private ComicRepository comicRepository;

    @GetMapping("/tags")
    public List<TagDto> getAllTags() {
        return tagRepository.findAll().stream()
                .map(t -> new TagDto(t.getId(), t.getName()))
                .collect(Collectors.toList());
    }

    @PostMapping("/tags")
    public ResponseEntity<TagDto> createTag(@RequestBody TagDto tagDto) {
        Optional<Tag> existingTag = Optional.ofNullable(tagRepository.findByName(tagDto.getName().trim()));
        if (existingTag.isPresent()) {
            Tag t = existingTag.get();
            return ResponseEntity.ok(new TagDto(t.getId(), t.getName()));
        }
        Tag newTag = new Tag();
        newTag.setName(tagDto.getName().trim());
        newTag = tagRepository.save(newTag);
        return ResponseEntity.ok(new TagDto(newTag.getId(), newTag.getName()));
    }

    @DeleteMapping("/tags/{id}")
    public ResponseEntity<Void> deleteTag(@PathVariable Long id) {
        if (tagRepository.existsById(id)) {
            tagRepository.deleteById(id);
            return ResponseEntity.ok().build();
        }
        return ResponseEntity.notFound().build();
    }

    @PostMapping("/comics/{comicId}/tags/{tagId}")
    public ResponseEntity<Void> addTagToComic(@PathVariable Long comicId, @PathVariable Long tagId) {
        Optional<Comic> comicOpt = comicRepository.findById(comicId);
        Optional<Tag> tagOpt = tagRepository.findById(tagId);

        if (comicOpt.isPresent() && tagOpt.isPresent()) {
            Comic comic = comicOpt.get();
            comic.getTags().add(tagOpt.get());
            comicRepository.save(comic);
            return ResponseEntity.ok().build();
        }
        return ResponseEntity.notFound().build();
    }

    @DeleteMapping("/comics/{comicId}/tags/{tagId}")
    public ResponseEntity<Void> removeTagFromComic(@PathVariable Long comicId, @PathVariable Long tagId) {
        Optional<Comic> comicOpt = comicRepository.findById(comicId);
        Optional<Tag> tagOpt = tagRepository.findById(tagId);

        if (comicOpt.isPresent() && tagOpt.isPresent()) {
            Comic comic = comicOpt.get();
            comic.getTags().remove(tagOpt.get());
            comicRepository.save(comic);
            return ResponseEntity.ok().build();
        }
        return ResponseEntity.notFound().build();
    }
}
