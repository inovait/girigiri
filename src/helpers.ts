import logger from "./logger.js"

export function validateEnvVar(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}


export async function retryWrapper<T>(
    fn: () => Promise<T>,
    maxRetries: number,
    delay: number
): Promise<T> {

  let retries = 0;
  while(retries < maxRetries) {
    try {
      if(retries > 0) { logger.info(`Retrying connection: Retry #${retries}`); }
      return await fn();
    } catch (err: any) {
      retries++;
      if (retries >= maxRetries) {
        logger.info("Over the maximum retry count for connecting.")
        throw err;
      }
      await new Promise(res => setTimeout(res, delay))
    }
  }
  
  throw new Error('Unexpected error establishing connection');
}