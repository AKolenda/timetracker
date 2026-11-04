export const PERSONAL_AGENT_PROJECT = "__personal__"

export function partitionAgentImportProjects({
  projects,
  mappings,
  importableProjects,
  unmappedProjects,
  selectedProject,
}: {
  projects: string[]
  mappings: Record<string, string>
  importableProjects: Iterable<string>
  unmappedProjects: Iterable<string>
  selectedProject?: string
}) {
  const importable = new Set(importableProjects)
  const unmapped = new Set(unmappedProjects)
  const visible: string[] = []
  const hidden: string[] = []

  for (const project of [...new Set(projects)]) {
    const selected = selectedProject === project
    const personal = mappings[project] === PERSONAL_AGENT_PROJECT
    const hasImportableTime = importable.has(project)
    const needsMapping = unmapped.has(project)

    if (selected || (!personal && (hasImportableTime || needsMapping))) visible.push(project)
    else hidden.push(project)
  }

  return { visible, hidden }
}

export interface FolderLinkedProject {
  id: string
  agentFolders?: string[]
}

export interface AgentFolderChange {
  id: string
  agentFolders: string[]
}

/** Folder names match whatever their case or surrounding spaces. */
export function agentFolderKey(folder: string) {
  return folder.trim().toLowerCase()
}

export function dedupeAgentFolders(folders: Iterable<string>) {
  const seen = new Set<string>()
  const result: string[] = []
  for (const folder of folders) {
    const name = folder.trim()
    const key = agentFolderKey(name)
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(name)
  }
  return result
}

/**
 * Where each folder's Agent Time goes. A folder linked to a project wins; otherwise this
 * browser's earlier choice (including "Personal") still applies.
 */
export function resolveAgentMappings(
  folders: Iterable<string>,
  projects: FolderLinkedProject[],
  localMappings: Record<string, string>
): Record<string, string> {
  const linked = new Map<string, string>()
  for (const project of projects) {
    for (const folder of project.agentFolders ?? []) {
      const key = agentFolderKey(folder)
      if (!linked.has(key)) linked.set(key, project.id)
    }
  }
  const result = { ...localMappings }
  for (const folder of folders) {
    const projectId = linked.get(agentFolderKey(folder))
    if (projectId) result[folder] = projectId
  }
  return result
}

/**
 * Links `folders` to `targetId` (null unlinks them) and takes them off every other project,
 * so a folder only ever imports into one place. With `replace`, the target keeps only `folders`.
 * Returns just the projects whose folder list changed.
 */
export function linkAgentFolders(
  projects: FolderLinkedProject[],
  targetId: string | null,
  folders: string[],
  replace = false
): AgentFolderChange[] {
  const keys = new Set(folders.map(agentFolderKey))
  const changes: AgentFolderChange[] = []
  for (const project of projects) {
    const current = project.agentFolders ?? []
    const next = project.id === targetId
      ? dedupeAgentFolders([...(replace ? [] : current), ...folders])
      : current.filter((folder) => !keys.has(agentFolderKey(folder)))
    if (next.length !== current.length || next.some((folder, index) => folder !== current[index])) {
      changes.push({ id: project.id, agentFolders: next })
    }
  }
  return changes
}

/** Earlier per-browser choices that can move onto a project, because no project has that folder yet. */
export function adoptableLocalMappings(projects: FolderLinkedProject[], localMappings: Record<string, string>) {
  const projectIds = new Set(projects.map((project) => project.id))
  const linked = new Set(projects.flatMap((project) => (project.agentFolders ?? []).map(agentFolderKey)))
  return Object.entries(localMappings).filter(
    ([folder, projectId]) => projectIds.has(projectId) && !linked.has(agentFolderKey(folder))
  )
}

function looseName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "")
}

/** Detected folders worth offering: ones matching what's typed, or else ones that look like the project's name. */
export function suggestAgentFolders(
  detected: Iterable<string>,
  { projectName, query, linked }: { projectName: string; query: string; linked: string[] },
  limit = 6
) {
  const taken = new Set(linked.map(agentFolderKey))
  const typed = agentFolderKey(query)
  const name = looseName(projectName)
  return dedupeAgentFolders(detected)
    .filter((folder) => !taken.has(agentFolderKey(folder)))
    .filter((folder) => {
      if (typed) return agentFolderKey(folder).includes(typed)
      const loose = looseName(folder)
      return loose.length >= 3 && name.length >= 3 && (loose.includes(name) || name.includes(loose))
    })
    .sort((a, b) => a.localeCompare(b))
    .slice(0, limit)
}
