// __tests__/FileManager.test.ts

import * as fs from "fs";
import logger from "../../logging/logger";
import { FileManager } from "../../manager/file.manager";
import { describe, it, expect, beforeEach, vi, Mock } from "vitest";

// Mock modules using Vitest
vi.mock("fs");
vi.mock("../../logging/logger");

describe("FileManager", () => {
  const mockDir = "/mock/dir";
  const mockFile = "/mock/dir/file.txt";
  const mockContent = "Hello World";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("checkDirectory", () => {
    it("should return true if directory exists", () => {
      // make the fs return true
      (fs.existsSync as unknown as Mock).mockReturnValue(true);
      // check if true is returned if directory exists
      expect(FileManager.checkDirectory(mockDir)).toBe(true);
      // check if mockdir was passed in the fs.existSync
      expect(fs.existsSync).toHaveBeenCalledWith(mockDir);
    });

    it("should return false and log if directory does not exist", () => {
      // make the fs return false
      (fs.existsSync as unknown as Mock).mockReturnValue(false);
      // check if true is returned if directory does not exist
      expect(FileManager.checkDirectory(mockDir)).toBe(false);
      // check if false is returned if directory exists
      expect(logger.info).toHaveBeenCalledWith(
        `Directory: ${mockDir} does not exist`
      );
    });

    it("should throw error on fs exception", () => {
      // check if error is thrown 
      (fs.existsSync as unknown as Mock).mockImplementation(() => {
        throw new Error("FS error");
      });
      expect(() => FileManager.checkDirectory(mockDir)).toThrow(
        /Error checking directory/
      );
    });
  });

  describe("makeDirectory", () => {
    it("should call fs.mkdirSync with recursive", () => {
      (fs.mkdirSync as unknown as Mock).mockReturnValue(undefined);
      FileManager.makeDirectory(mockDir);
      expect(fs.mkdirSync).toHaveBeenCalledWith(mockDir, { recursive: true });
    });

    it("should throw error on fs exception", () => {
      (fs.mkdirSync as unknown as Mock).mockImplementation(() => {
        throw new Error("mkdir error");
      });
      expect(() => FileManager.makeDirectory(mockDir)).toThrow(
        /Error creating directory/
      );
    });
  });

  describe("readDirectory", () => {
    it("should return directory contents", () => {
      const files = ["file1.txt", "file2.txt"];
      (fs.readdirSync as unknown as Mock).mockReturnValue(files);
      expect(FileManager.readDirectory(mockDir)).toEqual(files);
    });

    it("should throw error on fs exception", () => {
      (fs.readdirSync as unknown as Mock).mockImplementation(() => {
        throw new Error("readdir error");
      });
      expect(() => FileManager.readDirectory(mockDir)).toThrow(
        /Error reading directory/
      );
    });
  });

  describe("readFile", () => {
    it("should return file content", () => {
      (fs.readFileSync as unknown as Mock).mockReturnValue(mockContent);
      expect(FileManager.readFile(mockFile)).toBe(mockContent);
    });

    it("should throw error on fs exception", () => {
      (fs.readFileSync as unknown as Mock).mockImplementation(() => {
        throw new Error("readFile error");
      });
      expect(() => FileManager.readFile(mockFile)).toThrow(
        /Error reading file/
      );
    });
  });

  describe("writeFile", () => {
    it("should call fs.writeFileSync with content", () => {
      (fs.writeFileSync as unknown as Mock).mockReturnValue(undefined);
      FileManager.writeFile(mockFile, mockContent);
      expect(fs.writeFileSync).toHaveBeenCalledWith(mockFile, mockContent);
    });

    it("should throw error on fs exception", () => {
      (fs.writeFileSync as unknown as Mock).mockImplementation(() => {
        throw new Error("writeFile error");
      });
      expect(() => FileManager.writeFile(mockFile, mockContent)).toThrow(
        /Error writing file/
      );
    });
  });

  describe("removeFile", () => {
    it("should remove file and log info", () => {
      (fs.unlinkSync as unknown as Mock).mockReturnValue(undefined);
      FileManager.removeFile(mockFile);
      expect(fs.unlinkSync).toHaveBeenCalledWith(mockFile);
      expect(logger.info).toHaveBeenCalledWith(`File removed: ${mockFile}`);
    });

    it("should log warning if file does not exist", () => {
      const err: any = new Error();
      err.code = "ENOENT";
      (fs.unlinkSync as unknown as Mock).mockImplementation(() => {
        throw err;
      });
      FileManager.removeFile(mockFile);
      expect(logger.warn).toHaveBeenCalledWith(`File not found: ${mockFile}`);
    });

    it("should log error on other errors", () => {
      const err: any = new Error("Other error");
      (fs.unlinkSync as unknown as Mock).mockImplementation(() => {
        throw err;
      });
      FileManager.removeFile(mockFile);
      expect(logger.error).toHaveBeenCalledWith(
        `Error removing file: Other error`
      );
    });
  });

  describe("fileExists", () => {
    it("should return true if file exists", () => {
      (fs.existsSync as unknown as Mock).mockReturnValue(true);
      (fs.statSync as unknown as Mock).mockReturnValue({ isFile: () => true });
      expect(FileManager.fileExists(mockFile)).toBe(true);
    });

    it("should return false if file does not exist", () => {
      (fs.existsSync as unknown as Mock).mockReturnValue(false);
      expect(FileManager.fileExists(mockFile)).toBe(false);
    });

    it("should return false on fs exception and log error", () => {
      (fs.existsSync as unknown as Mock).mockImplementation(() => {
        throw new Error("stat error");
      });
      expect(FileManager.fileExists(mockFile)).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining("Error checking file existence")
      );
    });
  });
});
