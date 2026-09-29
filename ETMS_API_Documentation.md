# ETMS API Documentation

## How to use the Postman collection

1. Open Postman → **Import** → select `ETMS_Postman_Collection.json`.
2. Click the collection name → **Variables** tab. Fill in `admin_username` and `admin_password` with your real superuser credentials (from Phase 2's `createsuperuser`). Leave everything else as-is.
3. Make sure `python manage.py runserver` is running.
4. Run requests **top to bottom, folder by folder** (1 → 7). Login and create requests automatically save tokens and IDs into variables, so later requests (which reference `{{task_id}}`, `{{employee_access}}`, etc.) just work.
5. For **Upload Attachment**, open that request's Body tab and click "Select File" next to the `file` field before sending — Postman can't attach a file for you automatically.

All successful responses share this shape:
```json
{"success": true, "message": "...", "data": {...}}
```
All errors share this shape:
```json
{"success": false, "message": "...", "errors": {...}}
```

---

## 1. Authentication

### Register
`POST /api/auth/register/`
Auth: none (or Bearer admin token, to set role MANAGER/ADMIN)
```json
{
  "username": "john", "email": "john@example.com",
  "first_name": "John", "last_name": "Doe",
  "password": "StrongPass#2026", "confirm_password": "StrongPass#2026",
  "role": "EMPLOYEE"
}
```
**201** → user object, no password field. **400** if passwords mismatch, email taken, weak password, or a non-admin tries `role: MANAGER/ADMIN`.

### Login
`POST /api/auth/login/`
Auth: none
```json
{"username": "john", "password": "StrongPass#2026"}
```
**200** → `data.access`, `data.refresh`, `data.user`. **401** on wrong credentials.

### Token Refresh
`POST /api/auth/token/refresh/`
Auth: none
```json
{"refresh": "<refresh token>"}
```
**200** → new `data.access`.

### Profile
`GET /api/auth/profile/`
Auth: Bearer (any logged-in user)
**200** → the caller's own user details. **401** with no token.

### Change Password
`POST /api/auth/change-password/`
Auth: Bearer
```json
{"old_password": "...", "new_password": "...", "confirm_new_password": "..."}
```
**200** on success. **400** on wrong old password or mismatch.

---

## 2. Employees

Base: `/api/employees/`. Read: any authenticated user. Write (POST/PUT/PATCH/DELETE): **ADMIN only**.

| Method | URL | Body | Notes |
|---|---|---|---|
| GET | `/api/employees/` | — | Paginated, 10/page |
| POST | `/api/employees/` | `{"user": <id>, "employee_id": "EMP001", "full_name": "...", "email": "...", "phone": "...", "department": "...", "designation": "...", "manager": <employee id or null>, "joining_date": "YYYY-MM-DD", "is_active": true}` | `user` must not already have a profile |
| GET | `/api/employees/<id>/` | — | 404 if not found |
| PUT / PATCH | `/api/employees/<id>/` | any subset of the POST fields | — |
| DELETE | `/api/employees/<id>/` | — | 204 |

**Filters:** `?department=`, `?designation=`, `?manager=<employee id>`, `?is_active=true|false`
**Search:** `?search=` (matches name, employee_id, email, department, designation)
**Ordering:** `?ordering=full_name` or `?ordering=-joining_date`

---

## 3. Tasks

Base: `/api/tasks/`. `assigned_to` is always an **Employee id**, not a User id.

| Role | Create | Update | Delete | Sees |
|---|---|---|---|---|
| ADMIN | any employee | any field | yes | all tasks |
| MANAGER | own team only | any field (own team's tasks) | no | own team's tasks + tasks they assigned |
| EMPLOYEE | no | `status` only (not to CANCELLED) | no | own tasks only |

| Method | URL | Body |
|---|---|---|
| GET | `/api/tasks/` | — |
| POST | `/api/tasks/` | `{"title": "...", "description": "...", "assigned_to": <id>, "priority": "LOW\|MEDIUM\|HIGH", "status": "PENDING", "start_date": "YYYY-MM-DD", "deadline": "YYYY-MM-DD"}` |
| GET | `/api/tasks/<id>/` | — |
| PUT | `/api/tasks/<id>/` | full body (ADMIN/MANAGER only) |
| PATCH | `/api/tasks/<id>/` | partial body; EMPLOYEE may only send `{"status": "..."}` |
| DELETE | `/api/tasks/<id>/` | — (ADMIN only) |
| GET | `/api/tasks/my-tasks/` | — |
| GET | `/api/tasks/overdue/` | — |
| GET | `/api/tasks/completed/` | — |
| GET | `/api/tasks/pending/` | — |

**Filters:** `?status=`, `?priority=`, `?employee=<id>`, `?manager=<employee id>`, `?deadline=YYYY-MM-DD`, `?deadline_before=`, `?deadline_after=`
**Search:** `?search=` (title)
**Ordering:** `?ordering=deadline`, `-priority`, etc.

A task outside a user's visibility returns **404**, not 403.

---

## 4. Comments

| Method | URL | Body | Who |
|---|---|---|---|
| GET | `/api/tasks/<task_id>/comments/` | — | anyone who can see the task |
| POST | `/api/tasks/<task_id>/comments/` | `{"comment": "..."}` | anyone who can see the task |
| PUT/PATCH | `/api/comments/<id>/` | `{"comment": "..."}` | comment author only |
| DELETE | `/api/comments/<id>/` | — | author, or ADMIN |

---

## 5. Attachments

Upload as `multipart/form-data`, field name `file`. Allowed types: pdf, doc(x), xls(x), ppt(x), txt, csv, png, jpg/jpeg. Max size: 5 MB.

| Method | URL | Who |
|---|---|---|
| GET | `/api/tasks/<task_id>/attachments/` | anyone who can see the task |
| POST | `/api/tasks/<task_id>/attachments/` | anyone who can see the task |
| DELETE | `/api/attachments/<id>/` | uploader, or ADMIN |

**400** for a disallowed file type or a file over 5 MB.

---

## 6. Notifications

Auto-created on: task assigned, task reassigned, task completed, task status changed. A user only ever sees their own.

| Method | URL | Notes |
|---|---|---|
| GET | `/api/notifications/` | supports `?is_read=true\|false`; response includes `unread_count` |
| PATCH | `/api/notifications/<id>/read/` | 404 if it's not yours |
| PATCH | `/api/notifications/read-all/` | marks all of the caller's unread ones as read |

---

## 7. Dashboards

| Method | URL | Who | Returns |
|---|---|---|---|
| GET | `/api/dashboard/employee/` | anyone with an Employee profile | total/pending/in-progress/completed/overdue task counts + upcoming deadlines (next 7 days) |
| GET | `/api/dashboard/manager/` | MANAGER or ADMIN | team size, team task counts, per-employee breakdown |
| GET | `/api/dashboard/admin/` | ADMIN only | org-wide counts, department-wise stats, employee-wise stats |

---

## Suggested full run-through (matches the original spec's sequence)

1. Login as admin → 2. Register manager & employee → 3. Login as each → 4. Create employee profiles (manager first, then employee reporting to them) → 5. Create a task → 6. `my-tasks` as employee → 7. Update task status → 8. Add a comment → 9. Upload an attachment → 10. Check notifications → 11. Check all three dashboards → 12. Clean up with deletes.

## Common error codes across all endpoints

| Code | Meaning |
|---|---|
| 200 | Success (GET, PUT, PATCH) |
| 201 | Created (POST) |
| 204 | Deleted, no body returned |
| 400 | Validation error — check `errors` in the response |
| 401 | Missing or expired token — log in again |
| 403 | Logged in, but this role can't do this action |
| 404 | Not found, or exists but outside your visibility scope |
