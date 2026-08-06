import { describe, expect, it } from "@effect/vitest";

import {
  composerMentionPathFromAbsolute,
  partitionDroppedComposerFiles,
  workspaceRelativeDropPath,
} from "./composerFileDrop.ts";

const file = (name: string, type: string) => ({ name, type });

describe("workspaceRelativeDropPath", () => {
  it("relativizes a path inside the workspace", () => {
    expect(workspaceRelativeDropPath("/Users/me/repo/src/app.ts", "/Users/me/repo")).toBe(
      "src/app.ts",
    );
  });

  it("ignores workspace root casing and trailing separators", () => {
    expect(workspaceRelativeDropPath("/Users/Me/Repo/notes.txt", "/users/me/repo/")).toBe(
      "notes.txt",
    );
  });

  it("normalizes Windows separators", () => {
    expect(workspaceRelativeDropPath("C:\\repo\\logs\\app.log", "C:\\repo")).toBe("logs/app.log");
  });

  it("returns null for paths outside the workspace", () => {
    expect(workspaceRelativeDropPath("/tmp/other.log", "/Users/me/repo")).toBeNull();
  });

  it("refuses prefix matches that are not directory boundaries", () => {
    expect(workspaceRelativeDropPath("/Users/me/repo-copy/a.txt", "/Users/me/repo")).toBeNull();
  });

  it("returns null without a workspace root", () => {
    expect(workspaceRelativeDropPath("/Users/me/repo/a.txt", null)).toBeNull();
  });
});

describe("composerMentionPathFromAbsolute", () => {
  it("prefers the workspace-relative path", () => {
    expect(composerMentionPathFromAbsolute("/Users/me/repo/src/app.ts", "/Users/me/repo")).toBe(
      "src/app.ts",
    );
  });

  it("falls back to the normalized absolute path", () => {
    expect(composerMentionPathFromAbsolute("C:\\other\\notes.txt", "/Users/me/repo")).toBe(
      "C:/other/notes.txt",
    );
  });
});

describe("partitionDroppedComposerFiles", () => {
  it("routes images to the attachment flow untouched", () => {
    const image = file("shot.png", "image/png");
    const result = partitionDroppedComposerFiles([image], () => null, null);
    expect(result.imageFiles).toEqual([image]);
    expect(result.mentionText).toBeNull();
    expect(result.unresolvedFileNames).toEqual([]);
  });

  it("turns a non-image file with a workspace path into a relative mention", () => {
    const result = partitionDroppedComposerFiles(
      [file("app.log", "text/plain")],
      () => "/Users/me/repo/logs/app.log",
      "/Users/me/repo",
    );
    expect(result.mentionText).toBe("[app.log](logs/app.log) ");
    expect(result.imageFiles).toEqual([]);
    expect(result.unresolvedFileNames).toEqual([]);
  });

  it("keeps the absolute path for files outside the workspace", () => {
    const result = partitionDroppedComposerFiles(
      [file("test.mp3", "audio/mpeg")],
      () => "/Users/me/Downloads/test.mp3",
      "/Users/me/repo",
    );
    expect(result.mentionText).toBe("[test.mp3](/Users/me/Downloads/test.mp3) ");
  });

  it("handles directories, which carry an empty MIME type", () => {
    const result = partitionDroppedComposerFiles(
      [file("fixtures", "")],
      () => "/Users/me/repo/test/fixtures",
      "/Users/me/repo",
    );
    expect(result.mentionText).toBe("[fixtures](test/fixtures) ");
  });

  it("splits a mixed drop between attachments and mentions", () => {
    const image = file("shot.png", "image/png");
    const result = partitionDroppedComposerFiles(
      [image, file("data.csv", "text/csv")],
      () => "/Users/me/repo/data.csv",
      "/Users/me/repo",
    );
    expect(result.imageFiles).toEqual([image]);
    expect(result.mentionText).toBe("[data.csv](data.csv) ");
  });

  it("joins multiple mentions into a single insert", () => {
    const paths: Record<string, string> = {
      "a.log": "/repo/a.log",
      "b.log": "/repo/b.log",
    };
    const result = partitionDroppedComposerFiles(
      [file("a.log", "text/plain"), file("b.log", "text/plain")],
      (dropped) => paths[dropped.name] ?? null,
      "/repo",
    );
    expect(result.mentionText).toBe("[a.log](a.log) [b.log](b.log) ");
  });

  it("reports non-image files without a resolvable path", () => {
    const result = partitionDroppedComposerFiles(
      [file("test.mp3", "audio/mpeg")],
      () => null,
      "/Users/me/repo",
    );
    expect(result.mentionText).toBeNull();
    expect(result.unresolvedFileNames).toEqual(["test.mp3"]);
  });

  it("encodes paths with spaces as valid mention links", () => {
    const result = partitionDroppedComposerFiles(
      [file("my notes.txt", "text/plain")],
      () => "/Users/me/repo/docs/my notes.txt",
      "/Users/me/repo",
    );
    expect(result.mentionText).toBe("[my notes.txt](docs/my%20notes.txt) ");
  });
});
