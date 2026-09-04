import assert from "node:assert/strict"
import test from "node:test"

import { PERSONAL_AGENT_PROJECT, partitionAgentImportProjects } from "./agent-import-projects.ts"

test("hides personal projects and projects with no uncovered time", () => {
  assert.deepEqual(
    partitionAgentImportProjects({
      projects: ["Personal app", "FundingTracker", "Vivian"],
      mappings: {
        "Personal app": PERSONAL_AGENT_PROJECT,
        FundingTracker: "funding-tracker",
        Vivian: "vivian",
      },
      importableProjects: ["Vivian"],
      unmappedProjects: [],
    }),
    {
      visible: ["Vivian"],
      hidden: ["Personal app", "FundingTracker"],
    }
  )
})

test("keeps unmapped projects visible and reveals an explicitly selected hidden project", () => {
  assert.deepEqual(
    partitionAgentImportProjects({
      projects: ["Unknown", "FundingTracker"],
      mappings: { FundingTracker: "funding-tracker" },
      importableProjects: [],
      unmappedProjects: ["Unknown"],
      selectedProject: "FundingTracker",
    }),
    {
      visible: ["Unknown", "FundingTracker"],
      hidden: [],
    }
  )
})
