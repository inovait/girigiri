import * as fs from "fs";
import { ERROR_MESSAGES } from "../constants/error-messages.ts";
import logger from "../logging/logger.ts";

export const FileManager = {
  checkDirectory(directory_path: string) {
    if (!directory_path) {
      throw new Error(ERROR_MESSAGES.FILE.PATH_REQUIRED);
    }

    try {
      if (!fs.existsSync(directory_path)) {
        logger.info(`Directory: ${directory_path} does not exist`)
        return false;
      }
      return true;
    } catch (error) {
      logger.error(`Error while checking directory ${directory_path}: ${error}`)
      throw new Error(`Error checking directory ${directory_path}: ${error}`);
    }
  },

  makeDirectory(directory_path: string) {
    if (!directory_path) {
      throw new Error(ERROR_MESSAGES.FILE.PATH_REQUIRED);
    }

    try {
      return fs.mkdirSync(directory_path, { recursive: true });
    } catch (error) {
      throw new Error(`Error creating directory ${directory_path}: ${error}`);
    }
  },

  readDirectory(directory_path: string) {
    if (!directory_path) {
      throw new Error(ERROR_MESSAGES.FILE.PATH_REQUIRED);
    }

    try {
      return fs.readdirSync(directory_path);
    } catch (error) {
      logger.error(ERROR_MESSAGES.FILE.READ, error);
      throw new Error(`Error reading directory ${directory_path}: ${error}`);
    }
  },

  readFile(file_path: string) {
    if (!file_path) {
      throw new Error(ERROR_MESSAGES.FILE.PATH_REQUIRED);
    }

    try {
      return fs.readFileSync(file_path, "utf-8");
    } catch (error) {
      logger.error(ERROR_MESSAGES.FILE.READ, error);
      throw new Error(`Error reading file ${file_path}: ${error}`);
    }
  },

  writeFile(output_path: string, file_content: string) {
    if (!output_path) {
      throw new Error(ERROR_MESSAGES.FILE.PATH_REQUIRED);
    }

    try {
      fs.writeFileSync(output_path, file_content);
    } catch (error) {
      logger.error(ERROR_MESSAGES.FILE.WRITE, error);
      throw new Error(`Error writing file ${output_path}: ${error}`);
    }
  },

  removeFile(path: string) {
    if (!path) {
      throw new Error(ERROR_MESSAGES.FILE.PATH_REQUIRED);
    }

    try {
        fs.unlinkSync(path);
        logger.info(`File removed: ${path}`);
    } catch (err: any) {
        if (err.code === "ENOENT") {
            logger.warn(`File not found: ${path}`);
        } else {
            logger.error(ERROR_MESSAGES.FILE.DELETE, err);
        }
    }
  },

  /**
   * Check if a file exists
   * @param file_path - Path to the file to check
   * @returns true if file exists, false otherwise
   */
  fileExists(file_path: string): boolean {
    if (!file_path) {
      throw new Error(ERROR_MESSAGES.FILE.PATH_REQUIRED);
    }

    try {
      return fs.existsSync(file_path) && fs.statSync(file_path).isFile();
    } catch (error) {
      logger.error(`Error checking file existence ${file_path}: ${error}`);
      return false;
    }
  },
};