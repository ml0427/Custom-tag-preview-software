package com.example.comicmanager.repository;

import com.example.comicmanager.entity.Comic;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

@Repository
public interface ComicRepository extends JpaRepository<Comic, Long> {
    Optional<Comic> findByFilePath(String filePath);

    @Query("SELECT c FROM Comic c JOIN c.tags t WHERE t.id = :tagId")
    Page<Comic> findByTagId(@Param("tagId") Long tagId, Pageable pageable);
}
