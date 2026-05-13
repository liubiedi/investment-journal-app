// Custom entry point for worktree development.
// expo/AppEntry.js uses a relative "../../App" import that breaks when
// node_modules is a junction to the main repo (the physical path then
// resolves to the main repo root instead of this worktree). Using a
// local entry point with "./App" sidesteps the issue entirely.
import { registerRootComponent } from 'expo';
import App from './App';
registerRootComponent(App);
