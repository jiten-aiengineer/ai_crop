---
trigger: always_on
---

Global Code Style & Engineering Rules
You are working as a senior software engineer. Follow these rules for every code change, feature, bug fix, refactoring, and new module.
1. Imports
All imports must be placed at the top of the file.
Never place imports in the middle of a file or inside functions/components unless there is a strong technical reason.
Keep imports organized and consistent.
Prefer this order:
Framework/library imports
Third-party packages
Internal project imports
Relative imports
Remove unused imports.
Example:
import React from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { getUserProfile } from "@/services/userService";
import { User } from "@/types/user";
2. Modular Code
Write small, reusable, maintainable modules.
Avoid putting large amounts of logic inside a single file.
Each function/component/module should have a clear responsibility.
If a file becomes unnecessarily large or contains unrelated responsibilities, split it into smaller modules.
Follow the Single Responsibility Principle.
Prefer:
components/
  EmployeeCard/
    EmployeeCard.tsx
    EmployeeCard.types.ts
    EmployeeCard.utils.ts
over putting everything into one large component.
3. ALWAYS Reuse Existing Code Before Creating New Code
Before creating a new function, component, hook, utility, service, API method, or helper:
First search the existing codebase.
Check whether functionality already exists.
The order should be:
1. Search existing code
        ↓
2. Check whether an existing function/component can be reused
        ↓
3. Reuse it if suitable
        ↓
4. Extend/refactor it if necessary
        ↓
5. Create a new implementation only if nothing suitable exists
Never duplicate existing functionality.
For example, before creating:
formatCurrency()
search the project for existing currency-formatting utilities.
If an existing function already performs the required job, use it.
4. Frontend Component Reuse
The same rule applies to frontend components.
Before creating a new component:
Search existing components.
Check shared/common components.
Check UI components.
Check reusable form components.
Check existing table, modal, dialog, card, button, input, dropdown, etc.
Reuse existing components whenever possible.
Do NOT create a new component if an existing component can reasonably handle the requirement.
If an existing component is almost suitable:
Prefer improving/extending the existing component
over creating a duplicate component.
5. Avoid Duplicate Code
Do not duplicate:
Functions
Components
API calls
Validation logic
Formatting logic
Business logic
Constants
Types/interfaces
Hooks
Utility functions
Database queries
Services
If the same logic is required in multiple places, extract it into an appropriate reusable module.
6. Search Before Implementing
Before implementing a feature or fixing a bug:
Understand the existing architecture
        ↓
Search related files
        ↓
Search existing functions/components/services
        ↓
Understand how similar functionality is implemented
        ↓
Follow the existing project pattern
        ↓
Implement the change
Do not immediately start creating new files.
7. Follow Existing Project Architecture
Do not introduce a completely new architecture for a small feature.
Follow the project's existing folder structure and naming conventions.
Follow existing patterns for:
API calls
Authentication
State management
Error handling
Forms
Validation
Database access
Components
Services
Hooks
Types
Utilities
Consistency is more important than introducing a new pattern unnecessarily.
8. Keep Business Logic Separate
Do not put complex business logic directly inside UI components.
Prefer:
UI Component
    ↓
Hook / Service
    ↓
Business Logic
    ↓
API / Backend
Components should primarily handle:
Rendering
User interaction
Display state
Complex calculations, API logic, validation, and business rules should be moved to appropriate reusable modules.
9. Naming Conventions
Use clear and descriptive names.
Functions
Use verbs:
getEmployee()
createEmployee()
updateEmployee()
calculatePerformance()
validateExpense()
Avoid:
doStuff()
handleData()
process()
test()
unless the name is genuinely appropriate.
Components
Use PascalCase:
EmployeeCard
PerformanceDashboard
ExpenseForm
SalesActivityTable
Variables
Use camelCase:
employeeName
monthlySales
totalCollection
Constants
Use descriptive names:
MAX_FILE_SIZE
DEFAULT_PAGE_SIZE
API_TIMEOUT
10. Type Safety
Prefer strong typing.
Avoid any unless absolutely necessary.
Reuse existing types/interfaces before creating new ones.
Do not duplicate types that already exist.
Keep shared types in the appropriate shared/type module.
Prefer:
const employee: Employee = data;
instead of:
const employee: any = data;
11. Error Handling
Follow the project's existing error-handling pattern.
Do not silently ignore errors.
Provide meaningful error messages.
Avoid exposing sensitive technical information to end users.
Handle expected failures gracefully.
12. API and Service Reuse
Before creating a new API/service method:
Search existing API services.
Check whether the required endpoint/method already exists.
Reuse it if possible.
If an existing service can be extended, extend it.
Create a new service only when necessary.
Avoid multiple implementations of the same API operation.
13. Constants and Configuration
Do not hard-code values repeatedly.
Instead of:
if (status === "approved") {
when the project already has constants/enums, use the existing definition.
Similarly, do not duplicate:
URLs
Status values
Role names
Permission names
Configuration values
Limits
Labels
Reuse the existing source of truth.
14. Comments
Write comments only when they add meaningful context.
Do not write comments explaining obvious code.
Bad:
// Set employee name
employeeName = employee.name;
Good:
// GPS updates are intentionally throttled to reduce battery consumption
// while maintaining sufficient accuracy for field verification.
Prefer clean, self-explanatory code over excessive comments.
15. Do Not Over-Engineer
Implement the simplest solution that fits the existing architecture.
Do not introduce:
Unnecessary abstractions
Unnecessary libraries
Extra files
Complex design patterns
Duplicate layers
New dependencies
unless they provide a clear benefit.
16. Before Creating a New File
Ask internally:
Does this functionality already exist?
Can an existing file/module be extended?
Can an existing component/function/service be reused?
Is this file really necessary?
Only create a new file when it provides a clear architectural benefit.
17. Before Completing Any Task
Perform a final check:
Code Quality Checklist
 Imports are at the top.
 No unused imports.
 Existing functions were searched before creating new ones.
 Existing components were searched before creating new ones.
 Existing utilities/hooks/services were checked.
 No duplicate business logic was introduced.
 Existing project architecture is followed.
 Code is modular.
 Naming is clear and consistent.
 Existing types are reused.
 any is avoided where possible.
 Error handling follows the existing project pattern.
 No unnecessary dependencies were added.
 No unnecessary files were created.
 The implementation is as simple as reasonably possible.
Most Important Rule
SEARCH → REUSE → EXTEND → CREATE
Before writing new code, always inspect the existing codebase.
Never create a new function/component/service/utility if an existing implementation can reasonably be reused.
If existing code is close but does not completely satisfy the requirement, prefer extending or refactoring the existing implementation rather than creating duplicate functionality.
The goal is:
Less duplication + more reuse + modular code + consistent architecture + maintainable code.