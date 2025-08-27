// __tests__/FileManager.test.ts

import * as fs from "fs";
import logger from "../../logging/logger";
import { FileManager } from "../../manager/file.manager";
import { ERROR_MESSAGES } from "../../constants/error-messages";
import { describe, it, expect, beforeEach, vi, Mock } from "vitest";

// Mock modules using Vitest
vi.mock("fs");
vi.mock("../../logging/logger");

// Mock error messages
vi.mock("../../constants/error-messages", () => ({
  ERROR_MESSAGES: {
    FILE: {
      PATH_REQUIRED: "File path is required",
      READ: "Error reading file",
      WRITE: "Error writing file",
      DELETE: "Error deleting file",
    },
  },
}));

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
      // check if false is returned if directory does not exist
      expect(FileManager.checkDirectory(mockDir)).toBe(false);
      // check if info message is logged
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

    it("should throw ERROR_MESSAGES.FILE.PATH_REQUIRED when path is empty", () => {
      expect(() => FileManager.checkDirectory("")).toThrow(ERROR_MESSAGES.FILE.PATH_REQUIRED);
    });

    it("should throw ERROR_MESSAGES.FILE.PATH_REQUIRED when path is null/undefined", () => {
      expect(() => FileManager.checkDirectory(null as any)).toThrow(ERROR_MESSAGES.FILE.PATH_REQUIRED);
      expect(() => FileManager.checkDirectory(undefined as any)).toThrow(ERROR_MESSAGES.FILE.PATH_REQUIRED);
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

    it("should throw ERROR_MESSAGES.FILE.PATH_REQUIRED when path is empty", () => {
      expect(() => FileManager.makeDirectory("")).toThrow(ERROR_MESSAGES.FILE.PATH_REQUIRED);
    });

    it("should throw ERROR_MESSAGES.FILE.PATH_REQUIRED when path is null/undefined", () => {
      expect(() => FileManager.makeDirectory(null as any)).toThrow(ERROR_MESSAGES.FILE.PATH_REQUIRED);
      expect(() => FileManager.makeDirectory(undefined as any)).toThrow(ERROR_MESSAGES.FILE.PATH_REQUIRED);
    });
  });

  describe("readDirectory", () => {
    it("should return directory contents", () => {
      const files = ["file1.txt", "file2.txt"];
      (fs.readdirSync as unknown as Mock).mockReturnValue(files);
      expect(FileManager.readDirectory(mockDir)).toEqual(files);
    });

    it("should throw error on fs exception and log with ERROR_MESSAGES", () => {
      (fs.readdirSync as unknown as Mock).mockImplementation(() => {
        throw new Error("readdir error");
      });
      expect(() => FileManager.readDirectory(mockDir)).toThrow(
        /Error reading directory/
      );
      expect(logger.error).toHaveBeenCalledWith(
        ERROR_MESSAGES.FILE.READ,
        expect.any(Error)
      );
    });

    it("should throw ERROR_MESSAGES.FILE.PATH_REQUIRED when path is empty", () => {
      expect(() => FileManager.readDirectory("")).toThrow(ERROR_MESSAGES.FILE.PATH_REQUIRED);
    });

    it("should throw ERROR_MESSAGES.FILE.PATH_REQUIRED when path is null/undefined", () => {
      expect(() => FileManager.readDirectory(null as any)).toThrow(ERROR_MESSAGES.FILE.PATH_REQUIRED);
      expect(() => FileManager.readDirectory(undefined as any)).toThrow(ERROR_MESSAGES.FILE.PATH_REQUIRED);
    });
  });

  describe("readFile", () => {
    it("should return file content", () => {
      (fs.readFileSync as unknown as Mock).mockReturnValue(mockContent);
      expect(FileManager.readFile(mockFile)).toBe(mockContent);
    });

    it("should throw error on fs exception and log with ERROR_MESSAGES", () => {
      (fs.readFileSync as unknown as Mock).mockImplementation(() => {
        throw new Error("readFile error");
      });
      expect(() => FileManager.readFile(mockFile)).toThrow(
        /Error reading file/
      );
      expect(logger.error).toHaveBeenCalledWith(
        ERROR_MESSAGES.FILE.READ,
        expect.any(Error)
      );
    });

    it("should throw ERROR_MESSAGES.FILE.PATH_REQUIRED when path is empty", () => {
      expect(() => FileManager.readFile("")).toThrow(ERROR_MESSAGES.FILE.PATH_REQUIRED);
    });

    it("should throw ERROR_MESSAGES.FILE.PATH_REQUIRED when path is null/undefined", () => {
      expect(() => FileManager.readFile(null as any)).toThrow(ERROR_MESSAGES.FILE.PATH_REQUIRED);
      expect(() => FileManager.readFile(undefined as any)).toThrow(ERROR_MESSAGES.FILE.PATH_REQUIRED);
    });
  });

  describe("writeFile", () => {
    it("should call fs.writeFileSync with content", () => {
      (fs.writeFileSync as unknown as Mock).mockReturnValue(undefined);
      FileManager.writeFile(mockFile, mockContent);
      expect(fs.writeFileSync).toHaveBeenCalledWith(mockFile, mockContent);
    });

    it("should throw error on fs exception and log with ERROR_MESSAGES", () => {
      (fs.writeFileSync as unknown as Mock).mockImplementation(() => {
        throw new Error("writeFile error");
      });
      expect(() => FileManager.writeFile(mockFile, mockContent)).toThrow(
        /Error writing file/
      );
      expect(logger.error).toHaveBeenCalledWith(
        ERROR_MESSAGES.FILE.WRITE,
        expect.any(Error)
      );
    });

    it("should throw ERROR_MESSAGES.FILE.PATH_REQUIRED when path is empty", () => {
      expect(() => FileManager.writeFile("", mockContent)).toThrow(ERROR_MESSAGES.FILE.PATH_REQUIRED);
    });

    it("should throw ERROR_MESSAGES.FILE.PATH_REQUIRED when path is null/undefined", () => {
      expect(() => FileManager.writeFile(null as any, mockContent)).toThrow(ERROR_MESSAGES.FILE.PATH_REQUIRED);
      expect(() => FileManager.writeFile(undefined as any, mockContent)).toThrow(ERROR_MESSAGES.FILE.PATH_REQUIRED);
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

    it("should log error using ERROR_MESSAGES on other errors", () => {
      const err: any = new Error("Other error");
      (fs.unlinkSync as unknown as Mock).mockImplementation(() => {
        throw err;
      });
      FileManager.removeFile(mockFile);
      expect(logger.error).toHaveBeenCalledWith(
        ERROR_MESSAGES.FILE.DELETE,
        err
      );
    });

    it("should throw ERROR_MESSAGES.FILE.PATH_REQUIRED when path is empty", () => {
      expect(() => FileManager.removeFile("")).toThrow(ERROR_MESSAGES.FILE.PATH_REQUIRED);
    });

    it("should throw ERROR_MESSAGES.FILE.PATH_REQUIRED when path is null/undefined", () => {
      expect(() => FileManager.removeFile(null as any)).toThrow(ERROR_MESSAGES.FILE.PATH_REQUIRED);
      expect(() => FileManager.removeFile(undefined as any)).toThrow(ERROR_MESSAGES.FILE.PATH_REQUIRED);
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

    it("should throw ERROR_MESSAGES.FILE.PATH_REQUIRED when path is empty", () => {
      expect(() => FileManager.fileExists("")).toThrow(ERROR_MESSAGES.FILE.PATH_REQUIRED);
    });

    it("should throw ERROR_MESSAGES.FILE.PATH_REQUIRED when path is null/undefined", () => {
      expect(() => FileManager.fileExists(null as any)).toThrow(ERROR_MESSAGES.FILE.PATH_REQUIRED);
      expect(() => FileManager.fileExists(undefined as any)).toThrow(ERROR_MESSAGES.FILE.PATH_REQUIRED);
    });
  });

  describe("Error Messages Integration", () => {
    it("should use ERROR_MESSAGES constants correctly", () => {
      expect(ERROR_MESSAGES.FILE.PATH_REQUIRED).toBe("File path is required");
      expect(ERROR_MESSAGES.FILE.READ).toBe("Error reading file");
      expect(ERROR_MESSAGES.FILE.WRITE).toBe("Error writing file");
      expect(ERROR_MESSAGES.FILE.DELETE).toBe("Error deleting file");
    });
  });
});