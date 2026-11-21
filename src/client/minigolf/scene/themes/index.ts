// Le thème de chaque parcours (le Jardin sert d'habit aux parcours qui n'ont pas encore le leur).

import type { CourseId } from "../../../../shared/games/minigolf/courses.ts";
import type { Theme } from "./common.ts";
import { jardinTheme } from "./jardin.ts";

export function themeOf(id: CourseId): Theme {
  switch (id) {
    default:
      return jardinTheme();
  }
}
