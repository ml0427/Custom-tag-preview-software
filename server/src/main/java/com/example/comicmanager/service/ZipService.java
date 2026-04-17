package com.example.comicmanager.service;

import org.springframework.stereotype.Service;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import java.util.stream.Collectors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

@Service
public class ZipService {

    public List<String> getImageEntries(String zipFilePath) throws IOException {
        try (ZipFile zipFile = new ZipFile(zipFilePath)) {
            return zipFile.stream()
                .filter(entry -> !entry.isDirectory() && isImageFile(entry.getName()))
                .map(ZipEntry::getName)
                .collect(Collectors.toList());
        }
    }

    public byte[] extractImage(String zipFilePath, String imageName) throws IOException {
        try (ZipFile zipFile = new ZipFile(zipFilePath)) {
            ZipEntry entry = zipFile.getEntry(imageName);
            if (entry == null) return null;
            try (InputStream is = zipFile.getInputStream(entry);
                 ByteArrayOutputStream os = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192];
                int len;
                while ((len = is.read(buffer)) != -1) {
                    os.write(buffer, 0, len);
                }
                return os.toByteArray();
            }
        }
    }

    private boolean isImageFile(String fileName) {
        String lowerCaseName = fileName.toLowerCase();
        return lowerCaseName.endsWith(".jpg") || lowerCaseName.endsWith(".jpeg") ||
               lowerCaseName.endsWith(".png") || lowerCaseName.endsWith(".gif") ||
               lowerCaseName.endsWith(".webp");
    }
}
