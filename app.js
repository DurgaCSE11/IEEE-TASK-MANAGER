import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    getFirestore,
    collection,
    addDoc,
    query,
    where,
    onSnapshot,
    doc,
    setDoc,
    getDoc,
    updateDoc,
    orderBy,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ==========================================
// 1. FIREBASE CONFIGURATION
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyCf_P3NS3AKe__zrJhdXzYJzQn-IZ2ibBY",
    authDomain: "ieee-task-manager-cccfb.firebaseapp.com",
    projectId: "ieee-task-manager-cccfb",
    storageBucket: "ieee-task-manager-cccfb.firebasestorage.app",
    messagingSenderId: "764942735404",
    appId: "1:764942735404:web:bc43f89a215c5ae73fd989",
    measurementId: "G-SXY13KTE8R"
};

// ==========================================
// 2. STATE MANAGEMENT 
// ==========================================
let app, db, auth;
let currentUser = null; // { email, role, name, uid }
let unsubscribeTasks = null;

// DOM Elements
const views = {
    auth: document.getElementById('auth-view'),
    coordinator: document.getElementById('coordinator-dashboard'),
    member: document.getElementById('member-dashboard')
};

// Current Auth Mode ('login' or 'register')
let currentAuthMode = 'login';

// ==========================================
// 3. INITIALIZATION & UTILS
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    console.log("Firebase initialized successfully.");

    // Listen for auth state changes to persist sessions
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Only auto-login if they aren't already set up in UI (e.g., page reload)
            if (!currentUser) {
                try {
                    const userDoc = await getDoc(doc(db, "users", user.uid));
                    if (userDoc.exists()) {
                        const userData = userDoc.data();
                        loginUser({
                            uid: user.uid,
                            email: user.email,
                            role: userData.role,
                            name: userData.name
                        });
                    }
                } catch (err) {
                    console.error("Error fetching user session data:", err);
                }
            }
        }
    });

    setupEventListeners();
});

function showToast(message, type = "success") {
    const toast = document.getElementById('toast');
    const msgEl = document.getElementById('toast-message');

    msgEl.textContent = message;
    toast.className = 'toast';

    if (type === 'error') {
        toast.style.borderColor = 'var(--danger)';
    } else if (type === 'warning') {
        toast.style.borderColor = 'var(--warning)';
    } else {
        toast.style.borderColor = 'var(--success)';
    }

    toast.classList.remove('hidden');

    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

function formatDate(dateStringOrTimestamp) {
    if (!dateStringOrTimestamp) return "N/A";

    let date;
    // Handle Firestore timestamp
    if (typeof dateStringOrTimestamp.toDate === 'function') {
        date = dateStringOrTimestamp.toDate();
    } else {
        date = new Date(dateStringOrTimestamp);
    }

    return date.toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

function switchView(viewName) {
    Object.values(views).forEach(v => v.classList.remove('active'));
    Object.values(views).forEach(v => v.classList.add('hidden'));

    views[viewName].classList.remove('hidden');
    // small delay to allow display:block to apply before animation
    setTimeout(() => {
        views[viewName].classList.add('active');
    }, 10);
}

// ==========================================
// 4. AUTHENTICATION (Login / Register)
// ==========================================
function toggleAuthMode(e) {
    if (e) e.preventDefault();
    const title = document.getElementById('auth-title');
    const subtitle = document.getElementById('auth-subtitle');
    const submitBtn = document.getElementById('auth-submit-btn');
    const toggleText = document.getElementById('auth-toggle-text');
    const nameGroup = document.getElementById('name-group');
    const roleGroup = document.getElementById('role-group');

    if (currentAuthMode === 'login') {
        currentAuthMode = 'register';
        title.textContent = 'Join IEEE Tracker';
        subtitle.textContent = 'Create your account to get started.';
        submitBtn.innerHTML = '<span>Register</span><i class="fa-solid fa-user-plus"></i>';
        toggleText.innerHTML = 'Already have an account? <a href="#" id="toggle-auth-mode">Login here</a>';
        nameGroup.style.display = 'flex';
        roleGroup.style.display = 'grid';
        document.getElementById('name').setAttribute('required', 'true');
    } else {
        currentAuthMode = 'login';
        title.textContent = 'IEEE Task Tracker';
        subtitle.textContent = 'Welcome! Please log in to continue.';
        submitBtn.innerHTML = '<span>Login</span><i class="fa-solid fa-arrow-right"></i>';
        toggleText.innerHTML = 'Don\'t have an account? <a href="#" id="toggle-auth-mode">Register here</a>';
        nameGroup.style.display = 'none';
        roleGroup.style.display = 'none';
        document.getElementById('name').removeAttribute('required');
    }

    document.getElementById('toggle-auth-mode').addEventListener('click', toggleAuthMode);
}

async function handleAuthSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('email').value.trim().toLowerCase();
    const password = document.getElementById('password').value;

    if (!email || !password) return showToast("Please fill all required fields", "error");

    const submitBtn = document.getElementById('auth-submit-btn');
    const originalBtnText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<span>Processing...</span><i class="fa-solid fa-spinner fa-spin"></i>';
    submitBtn.disabled = true;

    try {
        if (currentAuthMode === 'register') {
            const name = document.getElementById('name').value.trim();
            const role = document.querySelector('input[name="role"]:checked').value;

            if (!name) throw new Error("Please enter your name");

            // Register user in Firebase Auth
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // Save additional user info (role, name) to Firestore 'users' collection
            await setDoc(doc(db, "users", user.uid), {
                email: user.email,
                name: name,
                role: role,
                createdAt: serverTimestamp()
            });

            loginUser({ uid: user.uid, email: user.email, role, name });
            showToast("Registration successful! Welcome.", "success");

        } else {
            // Login user with Firebase Auth
            const userCredential = await signInWithEmailAndPassword(auth, email, password);

            // Check their role from Firestore
            const userDoc = await getDoc(doc(db, "users", userCredential.user.uid));
            if (userDoc.exists()) {
                const userData = userDoc.data();
                loginUser({
                    uid: userCredential.user.uid,
                    email: userCredential.user.email,
                    role: userData.role,
                    name: userData.name
                });
                showToast(`Logged in successfully!`, "success");
            } else {
                showToast("User profile not found. Please contact an admin.", "error");
            }
        }
    } catch (error) {
        console.error("Auth error:", error);
        let errMsg = error.message;
        if (error.code === 'auth/email-already-in-use') errMsg = "Account with this email already exists";
        if (error.code === 'auth/invalid-credential') errMsg = "Invalid email or password";
        if (error.code === 'auth/weak-password') errMsg = "Password should be at least 6 characters";
        showToast(errMsg, "error");
    } finally {
        submitBtn.innerHTML = originalBtnText;
        submitBtn.disabled = false;
    }
}

function loginUser(user) {
    currentUser = user;

    document.getElementById('auth-form').reset();
    if (currentAuthMode === 'register') toggleAuthMode();

    if (user.role === 'coordinator') {
        document.getElementById('coord-user-email').textContent = user.name || user.email;
        switchView('coordinator');
        loadAllTasks();
    } else {
        document.getElementById('member-user-email').textContent = user.name || user.email;
        switchView('member');
        loadMemberTasks();
    }
}

async function handleLogout() {
    try {
        await signOut(auth);
        currentUser = null;
        if (unsubscribeTasks) {
            unsubscribeTasks();
            unsubscribeTasks = null;
        }
        document.getElementById('auth-form').reset();
        switchView('auth');
        showToast("Logged out successfully");
    } catch (error) {
        console.error("Logout error:", error);
        showToast("Error logging out", "error");
    }
}

// ==========================================
// 5. DATABASE OPERATIONS
// ==========================================
async function createTask(e) {
    e.preventDefault();

    const title = document.getElementById('task-title').value.trim();
    const assignee = document.getElementById('task-assignee').value.trim().toLowerCase();
    const deadline = document.getElementById('task-deadline').value;

    if (!title || !assignee || !deadline) {
        return showToast("Please fill all fields", "error");
    }

    const newTask = {
        title,
        assignedTo: assignee,
        deadline,
        status: 'Pending',
        createdBy: currentUser.email,
        createdAt: serverTimestamp()
    };

    try {
        await addDoc(collection(db, "tasks"), newTask);
        document.getElementById('create-task-form').reset();
        showToast("Task assigned successfully");
    } catch (error) {
        console.error("Error adding task: ", error);
        if (error.code === 'permission-denied') {
            showToast("Missing permissions. Check Firestore rules.", "error");
        } else {
            showToast("Error creating task", "error");
        }
    }
}

async function updateTaskStatus(taskId, newStatus) {
    try {
        const taskRef = doc(db, "tasks", taskId);
        await updateDoc(taskRef, {
            status: newStatus
        });
        showToast(`Task marked as ${newStatus}`);
    } catch (error) {
        console.error("Error updating document: ", error);
        showToast("Error updating task status", "error");
    }
}

// ==========================================
// 6. REAL-TIME LISTENERS & RENDERING
// ==========================================
function loadAllTasks() {
    const q = query(collection(db, "tasks"), orderBy("createdAt", "desc"));

    if (unsubscribeTasks) unsubscribeTasks();
    unsubscribeTasks = onSnapshot(q, (snapshot) => {
        const tasks = [];
        snapshot.forEach((doc) => {
            tasks.push({ id: doc.id, ...doc.data() });
        });
        renderCoordinatorTasks(tasks);
    }, (error) => {
        console.error("Error fetching tasks: ", error);
        if (error.code === 'failed-precondition') {
            showToast("Index not built yet. Tasks might be missing.", "warning");
        } else if (error.code === 'permission-denied') {
            showToast("Access Denied. Ensure Firestore rules are public/setup.", "error");
        }
    });

    // We don't need a DB re-query for filter since it's client-side, 
    // it's handled via the change listener re-triggering render.
}

function loadMemberTasks() {
    // Note: To use orderBy with where, Firebase requires a Composite Index. 
    // To keep this simple and avoid index errors for the user, we query `where` and sort client-side.
    const q = query(
        collection(db, "tasks"),
        where("assignedTo", "==", currentUser.email)
    );

    if (unsubscribeTasks) unsubscribeTasks();
    unsubscribeTasks = onSnapshot(q, (snapshot) => {
        const tasks = [];
        snapshot.forEach((doc) => {
            tasks.push({ id: doc.id, ...doc.data() });
        });

        // Manual client-side sorting by creation date
        tasks.sort((a, b) => {
            const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
            const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
            return timeB - timeA;
        });

        renderMemberTasks(tasks);
    }, (error) => {
        console.error("Error fetching member tasks:", error);
        if (error.code === 'permission-denied') {
            showToast("Access Denied. Ensure Firestore rules are public/setup.", "error");
        }
    });
}

function renderCoordinatorTasks(tasks) {
    const tbody = document.getElementById('all-tasks-body');
    const emptyState = document.getElementById('no-tasks-coord');
    const filterVal = document.getElementById('task-filter').value;

    // Calculate stats
    let pending = 0;
    let completed = 0;

    const filteredTasks = tasks.filter(task => {
        if (task.status === 'Pending') pending++;
        if (task.status === 'Completed') completed++;

        if (filterVal === 'all') return true;
        if (filterVal === 'pending') return task.status === 'Pending';
        if (filterVal === 'completed') return task.status === 'Completed';
    });

    // Update Stats UI
    document.getElementById('stat-total').textContent = tasks.length;
    document.getElementById('stat-pending').textContent = pending;
    document.getElementById('stat-completed').textContent = completed;

    if (filteredTasks.length === 0) {
        tbody.innerHTML = '';
        emptyState.classList.remove('hidden');
        document.querySelector('.tasks-table').classList.add('hidden');
        return;
    }

    emptyState.classList.add('hidden');
    document.querySelector('.tasks-table').classList.remove('hidden');

    tbody.innerHTML = filteredTasks.map(task => `
        <tr>
            <td><strong>${escapeHtml(task.title)}</strong></td>
            <td>${escapeHtml(task.assignedTo)}</td>
            <td>${formatDate(task.createdAt)}</td>
            <td>${formatDate(task.deadline)}</td>
            <td>
                <span class="badge ${task.status === 'Pending' ? 'badge-pending' : 'badge-completed'}">
                    ${task.status}
                </span>
            </td>
        </tr>
    `).join('');
}

function renderMemberTasks(tasks) {
    const container = document.getElementById('member-tasks-container');
    const emptyState = document.getElementById('no-tasks-member');

    const pendingTasks = tasks.filter(t => t.status === 'Pending');
    document.getElementById('member-pending-count').textContent = pendingTasks.length;

    if (tasks.length === 0) {
        container.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');

    container.innerHTML = tasks.map(task => `
        <div class="task-card">
            <div class="task-card-header">
                <div>
                    <h4 class="task-card-title">${escapeHtml(task.title)}</h4>
                    <span class="task-card-meta">
                        <i class="fa-regular fa-clock"></i> Deadline: ${formatDate(task.deadline)}
                    </span>
                    <span class="task-card-meta">
                        <i class="fa-regular fa-calendar-plus"></i> Assigned: ${formatDate(task.createdAt)}
                    </span>
                </div>
                <span class="badge ${task.status === 'Pending' ? 'badge-pending' : 'badge-completed'}">
                    ${task.status}
                </span>
            </div>
            
            <div class="task-card-footer">
                <span class="text-muted" style="font-size: 0.8rem">Assigned by: ${escapeHtml(task.createdBy)}</span>
                ${task.status === 'Pending'
            ? `<button class="btn btn-sm btn-success mark-complete-btn" data-id="${task.id}">
                         <i class="fa-solid fa-check"></i> Mark Completed
                       </button>`
            : `<span class="text-success" style="font-size: 0.85rem;"><i class="fa-solid fa-check-double"></i> Done</span>`
        }
            </div>
        </div>
    `).join('');

    // Attach event listeners for the dynamic buttons
    container.querySelectorAll('.mark-complete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const taskId = e.currentTarget.getAttribute('data-id');
            updateTaskStatus(taskId, 'Completed');
        });
    });
}

function setupEventListeners() {
    document.getElementById('auth-form').addEventListener('submit', handleAuthSubmit);
    document.getElementById('toggle-auth-mode').addEventListener('click', toggleAuthMode);
    document.getElementById('create-task-form').addEventListener('submit', createTask);

    document.querySelectorAll('.logout-btn').forEach(btn => {
        btn.addEventListener('click', handleLogout);
    });

    document.getElementById('task-filter').addEventListener('change', () => {
        if (currentUser && currentUser.role === 'coordinator') {
            loadAllTasks(); // This could be optimized to just re-render, but a simple re-hook is okay for now.
        }
    });
}

// Security: Prevent XSS when rendering user input
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

