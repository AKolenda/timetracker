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

export interface AgentFolderActivity {
  name: string
  /** ISO time of the folder's latest agent activity, or "" if none was seen. */
  lastActive: string
  seconds: number
}

/** Every folder Agent Time knows, most recently active first, with its total agent time. */
export function summarizeAgentFolders(
  names: Iterable<string>,
  blocks: { project: string; end: string; durationSeconds: number }[]
): AgentFolderActivity[] {
  const folders = new Map<string, AgentFolderActivity>()
  for (const name of names) folders.set(name, { name, lastActive: "", seconds: 0 })
  for (const block of blocks) {
    const folder = folders.get(block.project) ?? { name: block.project, lastActive: "", seconds: 0 }
    folder.seconds += block.durationSeconds
    if (block.end > folder.lastActive) folder.lastActive = block.end
    folders.set(block.project, folder)
  }
  return [...folders.values()].sort((a, b) => b.lastActive.localeCompare(a.lastActive) || a.name.localeCompare(b.name))
}

/**
 * Folders to offer for a project. While typing: folders containing the text, prefix matches first.
 * Otherwise: folders that look like the project's name, then recently active folders no project has yet.
 * Folders already on this project are never offered.
 */
export function suggestAgentFolders(
  detected: AgentFolderActivity[],
  { projectName, query, linked, linkedElsewhere }: {
    projectName: string
    query: string
    linked: string[]
    linkedElsewhere: Set<string>
  },
  limit = 8
): AgentFolderActivity[] {
  const taken = new Set(linked.map(agentFolderKey))
  const seen = new Set<string>()
  const candidates = detected.filter((folder) => {
    const key = agentFolderKey(folder.name)
    if (!key || taken.has(key) || seen.has(key)) return false
    seen.add(key)
    return true
  })
  const typed = agentFolderKey(query)
  if (typed) {
    const matches = candidates.filter((folder) => agentFolderKey(folder.name).includes(typed))
    const prefix = matches.filter((folder) => agentFolderKey(folder.name).startsWith(typed))
    return [...prefix, ...matches.filter((folder) => !prefix.includes(folder))].slice(0, limit)
  }
  const name = looseName(projectName)
  const nameWords = words(projectName)
  const lookAlike = candidates.filter((folder) => {
    const loose = looseName(folder.name)
    return loose.length >= 3 && name.length >= 3 && (loose.includes(name) || name.includes(loose))
  })
  const sharesWord = candidates.filter(
    (folder) => !lookAlike.includes(folder) && words(folder.name).some((word) => nameWords.includes(word))
  )
  const unclaimed = candidates.filter(
    (folder) =>
      !lookAlike.includes(folder) &&
      !sharesWord.includes(folder) &&
      !linkedElsewhere.has(agentFolderKey(folder.name)) &&
      folder.seconds >= 15 * 60 &&
      !isThrowawayFolder(folder.name)
  )
  return [...lookAlike, ...sharesWord, ...unclaimed].slice(0, limit)
}

function words(value: string) {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 4)
}

/** Hidden folders, dated scratch folders and generated ids; still offered when typed. */
function isThrowawayFolder(name: string) {
  return /^\./.test(name) || /^\d{4}-\d{2}-\d{2}-/.test(name) || /-[0-9a-f]{8}$/i.test(name) || /^agent-[0-9a-f]{10,}$/i.test(name)
}
