import React from 'react';
import WorkspaceShell from '../components/WorkspaceShell.jsx';
import ModuleWorkspace, { PURCHASING_TABS } from '../PurchasingWorkspace.jsx';
import { APP } from '../appSettings.js';

export default function Workspace(props) {
  return <WorkspaceShell {...props} app={APP} tabs={PURCHASING_TABS} Workspace={ModuleWorkspace} />;
}
