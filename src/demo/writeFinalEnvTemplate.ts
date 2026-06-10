import { writeFile } from "node:fs/promises";
import { finalEnvTemplate } from "./finalEnvTemplate.js";

await writeFile("submission/final-env-template.env", finalEnvTemplate, "utf8");
console.log("Wrote submission/final-env-template.env");
