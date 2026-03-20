# Natillera Loan ID Bug Fix - TODO

## Status: 🔄 In Progress (0/3)

### Plan Steps:
- [ ] **1. Fix main.js mapping logic** (Remove reverse() confusion, add real ID display)
- [ ] **2. Update dashboard.html UI** (Add position/real ID helpers + warnings)  
- [ ] **3. Test & attempt_completion**

### Testing:
```
1. Load dashboard → disable ID #18
2. Confirm #75 loan → should go to #75 (not #76)
3. Visual positions match real IDs
```

**Next:** Edit main.js mapping

