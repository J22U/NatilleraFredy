# Plan to Fix Rifas Information Display Issue

## Problem
The raffle information (rifas) is showing empty when loading from the server.

## Root Cause Analysis
1. Date format mismatch between frontend and database
2. The API `/api/cargar-rifas` might be returning `{ sinDatos: true }` incorrectly
3. The `crearTabla` function might not be receiving the participant data correctly
4. Debug logging is insufficient to diagnose the issue

## Solution Plan

### Step 1: Add Debug Logging
- Add more detailed console logs in both frontend and backend
- Log exactly what data is being sent and received

### Step 2: Fix Date Handling
- Ensure consistent date format (YYYY-MM-DD) throughout
- Add date normalization in the server

### Step 3: Fix Data Loading
- Verify the API returns correct data structure
- Ensure `crearTabla` receives participants correctly

### Step 4: Test the Fix
- Verify data loads correctly after changes
