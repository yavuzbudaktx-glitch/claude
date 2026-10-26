import { writeFileSync } from "node:fs";
import { buildGarage, parkedCars } from "../src/game/garage";
import { toPNG } from "./png";
writeFileSync(".preview/garage-day.png", toPNG(buildGarage(12, parkedCars(["car-mini", "car-q50", "car-ioniq5"])), 2));
writeFileSync(".preview/garage-night.png", toPNG(buildGarage(22, parkedCars(["car-mini"])), 2));
