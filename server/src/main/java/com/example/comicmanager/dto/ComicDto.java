package com.example.comicmanager.dto;

import java.time.LocalDateTime;
import java.util.Set;

public class ComicDto {
    private Long id;
    private String filePath;
    private String title;
    private String customCoverPath;
    private LocalDateTime importTime;
    private Long fileSize;
    private LocalDateTime fileModifiedTime;
    private Set<TagDto> tags;

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

    public Set<TagDto> getTags() { return tags; }
    public void setTags(Set<TagDto> tags) { this.tags = tags; }
}
