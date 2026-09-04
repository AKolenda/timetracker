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
