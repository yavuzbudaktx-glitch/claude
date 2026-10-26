import { writeFileSync } from "node:fs";
import { buildGarage } from "../src/game/garage";
import { toPNG } from "./png";
writeFileSync(".preview/garage-day.png", toPNG(buildGarage(12, "car-ioniq5"), 3));
writeFileSync(".preview/garage-night.png", toPNG(buildGarage(22, "car-mini"), 3));
