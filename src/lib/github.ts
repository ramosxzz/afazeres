import type { GithubRepo, ProjectInput, ProjectStatus } from "@shared/types";
import { repoToProject as mapRepo } from "@shared/githubMap";
import { PROJECT_COLORS } from "./constants";

export { guessStatus, guessType, normUrl, parseGithubUrl, prettyName } from "@shared/githubMap";

export function repoToProject(repo: GithubRepo, status: ProjectStatus, index: number, login = ""): ProjectInput {
  return mapRepo(repo, status, PROJECT_COLORS[index % PROJECT_COLORS.length], login);
}
