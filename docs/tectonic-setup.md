# Tectonic Setup (Windows)

This guide shows how to install the MSVC build of Tectonic and add it to your PATH so the backend can generate PDFs.

Tectonic is a LaTeX engine that takes a `.tex` file and produces a PDF. In this project, it powers the resume PDF download feature by compiling the generated LaTeX into a printable resume.

## 1) Download Tectonic (MSVC)
- Open: https://github.com/tectonic-typesetting/tectonic/releases/tag/tectonic%400.16.8
- Download the **MSVC** zip for Windows (the file name includes `x86_64-pc-windows-msvc`).

## 2) Extract the zip
- Extract to a folder you will keep, for example:
  - `C:\Tools\tectonic`

You should see `tectonic.exe` inside that folder.

## 3) Add Tectonic to PATH
1. Open Start Menu and search **Environment Variables**.
2. Choose **Edit the system environment variables**.
3. Click **Environment Variables...**
4. Under **User variables** (or **System variables**), select **Path** and click **Edit**.
5. Click **New** and add the folder that contains `tectonic.exe` (not the exe itself), e.g.:
   - `C:\Tools\tectonic`
6. Click **OK** to close all dialogs.

## 4) Verify in a new terminal
Open a new PowerShell window and run:
```
where.exe tectonic
```
You should see a valid path and version output.

## 5) Restart the backend
If the backend was already running, restart it so it picks up the PATH change.

### Common notes
- If `where.exe tectonic` shows nothing, re-check the PATH entry.
- The PATH must point to the folder that contains `tectonic.exe`, not the zip file.
