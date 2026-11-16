import { writeSync } from "node:fs";

export function stopWith(message) {
  const bytes = Buffer.from(message);
  let written = 0;
  while (written < bytes.length) {
    try {
      written += writeSync(process.stderr.fd, bytes, written);
    } catch (error) {
      if (error.code !== "EAGAIN") throw error;
    }
  }
  process.exit(1);
}
