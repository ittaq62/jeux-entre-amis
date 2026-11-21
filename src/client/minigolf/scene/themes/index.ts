// Le thème de chaque parcours (le Jardin sert d'habit aux parcours qui n'ont pas encore le leur).

import type { CourseId } from "../../../../shared/games/minigolf/courses.ts";
import type { Theme } from "./common.ts";
import { cuisineTheme } from "./cuisine.ts";
import { jungleTheme } from "./jungle.ts";
import { jardinTheme } from "./jardin.ts";
import { merTheme } from "./mer.ts";
import { montagneTheme } from "./montagne.ts";

export function themeOf(id: CourseId): Theme {
  switch (id) {
    case "mer":
      return merTheme();
    case "montagne":
      return montagneTheme();
    case "cuisine":
      return cuisineTheme();
    case "jungle":
      return jungleTheme();
    default:
      return jardinTheme();
  }
}
