import * as fs from "fs";
import logger from "../logging/logger.ts";

export const FileManager = {
  checkDirectory(directory_path: string) {
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
    try {
      return fs.mkdirSync(directory_path, { recursive: true });
    } catch (error) {
      throw new Error(`Error creating directory ${directory_path}: ${error}`);
    }
  },

  readDirectory(directory_path: string) {
    try {
      return fs.readdirSync(directory_path);
    } catch (error) {
      throw new Error(`Error reading directory ${directory_path}: ${error}`);
    }
  },

  readFile(file_path: string) {
    try {
      return fs.readFileSync(file_path, "utf-8");
    } catch (error) {
      throw new Error(`Error reading file ${file_path}: ${error}`);
    }
  },

  writeFile(output_path: string, file_content: string) {
    try {
      fs.writeFileSync(output_path, file_content);
    } catch (error) {
      throw new Error(`Error writing file ${output_path}: ${error}`);
    }
  },

  removeFile(path: string) {
    try {
        fs.unlinkSync(path);
        logger.info(`File removed: ${path}`);
    } catch (err: any) {
        if (err.code === "ENOENT") {
            logger.warn(`File not found: ${path}`);
        } else {
            logger.error(`Error removing file: ${err.message}`);
        }
    }
  },

  /**
   * Check if a file exists
   * @param file_path - Path to the file to check
   * @returns true if file exists, false otherwise
   */
  fileExists(file_path: string): boolean {
    try {
      return fs.existsSync(file_path) && fs.statSync(file_path).isFile();
    } catch (error) {
      logger.error(`Error checking file existence ${file_path}: ${error}`);
      return false;
    }
  },
};