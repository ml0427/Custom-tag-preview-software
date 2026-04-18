package com.example.comicmanager.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;

@Entity
@Table(name = "comic")
public class Comic {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "file_path", nullable = false)
    private String filePath;

    @Column(name = "title", nullable = false)
    private String title;

    @Column(name = "custom_cover_path")
    private String customCoverPath;

    @Column(name = "import_time", nullable = false)
    private LocalDateTime importTime = LocalDateTime.now();

    @Column(name = "file_size")
    private Long fileSize;

    @Column(name = "file_modified_time")
    private LocalDateTime fileModifiedTime;

    @ManyToMany
    @JoinTable(
        name = "comic_tag_mapping",
        joinColumns = @JoinColumn(name = "comic_id"),
        inverseJoinColumns = @JoinColumn(name = "tag_id")
    )
    private Set<Tag> tags = new HashSet<>();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    
    public String getFilePath() { return filePath; }
    public void setFilePath(String filePath) { this.filePath = filePath; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getCustomCoverPath() { return customCoverPath; }
    public void setCustomCoverPath(String customCoverPath) { this.customCoverPath = customCoverPath; }

    public LocalDateTime getImportTime() { return importTime; }
    public void setImportTime(LocalDateTime importTime) { this.importTime = importTime; }

    public Long getFileSize() { return fileSize; }
    public void setFileSize(Long fileSize) { this.fileSize = fileSize; }

    public LocalDateTime getFileModifiedTime() { return fileModifiedTime; }
    public void setFileModifiedTime(LocalDateTime fileModifiedTime) { this.fileModifiedTime = fileModifiedTime; }

    public Set<Tag> getTags() { return tags; }
    public void setTags(Set<Tag> tags) { this.tags = tags; }
}
