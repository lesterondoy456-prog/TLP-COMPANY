import React from 'react';
import WorkspaceShell from '../components/WorkspaceShell.jsx';
import ModuleWorkspace, { CONFIGURATION_TABS } from '../ConfigurationWorkspace.jsx';
import { APP } from '../appSettings.js';

export default function Workspace(props) {
  return <WorkspaceShell {...props} app={APP} tabs={CONFIGURATION_TABS} Workspace={ModuleWorkspace} />;
}
