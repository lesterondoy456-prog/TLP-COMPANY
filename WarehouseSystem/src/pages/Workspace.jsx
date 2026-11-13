import React from 'react';
import WorkspaceShell from '../components/WorkspaceShell.jsx';
import ModuleWorkspace, { WAREHOUSE_TABS } from '../WarehouseWorkspace.jsx';
import { APP } from '../appSettings.js';

export default function Workspace(props) {
  return <WorkspaceShell {...props} app={APP} tabs={WAREHOUSE_TABS} Workspace={ModuleWorkspace} />;
}
