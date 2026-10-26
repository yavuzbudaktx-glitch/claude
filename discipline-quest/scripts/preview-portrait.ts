import { writeFileSync } from "node:fs";
import { PORTRAIT_ROWS, renderPortrait } from "../src/game/sprites/portrait";
import { toPNG } from "./png";
PORTRAIT_ROWS.forEach((r, i) => r.length !== 32 && console.log("row", i, "len", r.length));
writeFileSync(".preview/portrait.png", toPNG(renderPortrait(), 10, [190, 210, 225]));
