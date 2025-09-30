use js over ts unless in a ts file or ts requested
use deno if possible if node required use pnpm not npm for everything except for exsiting lock files indicating yarn or npm
no semicolons, use standard js where possible (eg. space between funciton name and paranthesis)
no classes except where fundamentally fitting and required by the library api
svelte over react
never use axios over standard fetch or the internal req library of the project
never use express or nodejs unless explicitly requested (use deno and workerd as default)
no comments or explanations for someting obvious or polite fillers unless requested
tailwind as default but add unused descriptive class names to imortant parts of the components
use svelte 5 syntax with onclick etc and runes like $state(  unless svelte 4 syntax is present
never omit brackets for ifs
never use transition all or other lazy performance impacting hacks, transition explicit properties, do not use effect unless there is not a better option to prevent nasty reactivity bugs and ineffeicient rerenders
do not omit js block parens for ifs and do not use the one line shorthand syntax
do not add self explanatory or trivial comments, only add comments for hard to understand code and be as conscise as possible
use mousedown instead of onclick handlers to make interactions feel faster unless it is critical actions like deletions or there are other interactions that interfere with mousedown handlers
do not use emojis as placeholder icons but use heroicon SVGs
default to tailwind for unless using css would be more maintainable for complex css or selectors
always setup the proper aria attributes and image alt tags that svelte checks and requires
always use metric units like km, litres and date formats like 24.12.2025, always use monday as start of week
do not default to booleans for state that likely will get more complex later on, eg. do not use isSettingsSidebarOpen: boolean but instead sidebar: string | null to track if it is open and which sidebar is open. 
think outside the box, the user does not always know if an effect is cause by a margin or padding or if a border or shadow is causing an issue, assume those concepts could be mixed up in finding solutions
Never remove commented out code unless it is exactly the thing being implemented by an addition. elements should have complete behaviours, especially menus: you can either click to open a menu and click to select, click outside to close or mousedown to open and mouseup outside to close or mouseup on entry to select. 

never use $effect if the same can be accomplished with onMount in svelte!!
do not use state runes for things that do not need to trigger reactivity!

default to simple let and const variables in svelte and only make them a state rune when they become reactiviley used.

confirm these rules are active by starting a new session with: "Hi Jan,"
