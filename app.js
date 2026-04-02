/**
 * TÊN DỰ ÁN: Cổng Quản Lý SunnyEnglish
 * MÔ TẢ: File xử lý Logic Giao diện và API Fetch tới Google Apps Script
 */

const AppState = {
    apiUrl: (typeof CONFIG !== 'undefined' && CONFIG.GAS_URL) ? CONFIG.GAS_URL : (localStorage.getItem('GAS_URL') || ''),
    classes: [],
    students: [],
    attendances: [],
    theme: localStorage.getItem('theme') || 'light'
};

/* --- 1. CORE & UI LOGIC --- */

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    setupNavigation();
    
    // Check if API URL is set
    if (!AppState.apiUrl) {
        document.getElementById('setupModal').classList.add('show');
    } else {
        document.getElementById('setupModal').classList.remove('show');
        loadInitialData();
    }

    // Save API URL Event
    document.getElementById('btn-save-api').addEventListener('click', () => {
        const url = document.getElementById('api-url-input').value.trim();
        if(url.startsWith('https://script.google.com/')) {
            localStorage.setItem('GAS_URL', url);
            AppState.apiUrl = url;
            document.getElementById('setupModal').classList.remove('show');
            loadInitialData();
        } else {
            alert('URL không hợp lệ. Vui lòng thử lại!');
        }
    });
});

function initTheme() {
    if (AppState.theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    }
    document.getElementById('theme-toggle').addEventListener('click', () => {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        if (isDark) {
            document.documentElement.removeAttribute('data-theme');
            localStorage.setItem('theme', 'light');
        } else {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
        }
    });
}

window.showToast = (msg, type = 'success') => {
    const container = document.getElementById('toast-container');
    if(!container) return;
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i> ` + msg;
    container.appendChild(t);
    setTimeout(() => { t.style.animation = 'fadeOutToast 0.3s ease forwards'; setTimeout(() => t.remove(), 300); }, 3000);
};

function setupNavigation() {
    // Lưu trạng thái Lớp học và Tháng Báo cáo
    document.getElementById('attendance-class').addEventListener('change', (e) => {
        localStorage.setItem('sunny_last_class', e.target.value);
    });
    document.getElementById('billing-month').addEventListener('change', (e) => {
        localStorage.setItem('sunny_last_billing_month', e.target.value);
    });
    const navItems = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.view-section');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            // Cập nhật trạng thái Nav menu
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            
            // Highlight section
            const viewId = `view-${item.dataset.view}`;
            sections.forEach(sec => sec.classList.remove('active'));
            document.getElementById(viewId).classList.add('active');
        });
    });
}

function showLoader(text = 'Đang xử lý...') {
    document.getElementById('loader-text').innerText = text;
    document.getElementById('global-loader').style.display = 'flex';
}

function hideLoader() {
    document.getElementById('global-loader').style.display = 'none';
}

/* --- 2. API REQUEST WRAPPER & AUTO-RETRY --- */

async function fetchGAS(action, payload = {}, retries = 3) {
    if(!AppState.apiUrl) return null;
    try {
        const response = await fetch(AppState.apiUrl, {
            method: 'POST',
            body: JSON.stringify({ action: action, data: payload }),
            // text/plain prevents CORS preflight OPTIONS request
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        
        const rawText = await response.text(); 
        try {
            const result = JSON.parse(rawText);
            if(result.status === 'success') {
                return result.data;
            } else {
                console.error('GAS Error:', result.message);
                if(retries === 0) alert('Lỗi: ' + result.message);
                return null;
            }
        } catch(e) {
            // Xảy ra khi máy chủ Google bị quá tải và trả về mã HTML (trang đăng nhập/cảnh báo)
            if (retries > 0) {
                console.warn(`[Auto-Retry] Google Server thả mã HTML thay vì JSON. Đang thử móc lại dữ liệu... (Còn ${retries} lần tái yêu cầu)`);
                await new Promise(resolve => setTimeout(resolve, 1500)); // Nghỉ 1.5 giây để Google thông mạng
                return await fetchGAS(action, payload, retries - 1);
            }
            
            // Xịt cả 3 lần
            console.error('Raw HTML received:', rawText);
            alert('Hệ thống Google kết nối quá kém và đã từ chối cập nhật dữ liệu của bạn.\n\nVui lòng BẤM LẠI NÚT LƯU hoặc F5 TẢI LẠI TRANG để tránh thất thoát dữ liệu thao tác vừa rồi!');
            if (document.getElementById('global-loader').style.display === 'flex') {
                 hideLoader();
            }
            return null;
        }
    } catch(err) {
        if (retries > 0) {
            console.warn(`[Auto-Retry] Rớt mạng/CORS. Đang thử lại... (Còn ${retries} lần tái yêu cầu)`);
            await new Promise(resolve => setTimeout(resolve, 1500)); 
            return await fetchGAS(action, payload, retries - 1);
        }
        console.error('Fetch Network/CORS Error:', err);
        alert('Máy của bạn đã mất mạng hoàn toàn hoặc trình duyệt chặn luồng tải (Lỗi Mạng/CORS)!');
        return null;
    }
}

/* --- 3. INIT DATA LOAD --- */
function saveToCache() {
    try {
        localStorage.setItem('sunny_cache_data', JSON.stringify({
            classes: AppState.classes,
            students: AppState.students,
            attendances: AppState.attendances
        }));
    } catch(e) {}
}

function updateDashboardUI() {
    document.getElementById('stat-total-students').innerText = AppState.students.length;
    document.getElementById('stat-total-classes').innerText = AppState.classes.length;
    document.getElementById('system-status').innerHTML = '✅ Lấy dữ liệu thành công. Hệ thống sẵn sàng!';
    document.getElementById('system-status').className = 'alert badge-success mt-2';
    
    populateClassSelects();
    renderStudentTable();
    renderClassSettings();
}

async function loadInitialData() {
    const cachedString = localStorage.getItem('sunny_cache_data');
    if (cachedString) {
        try {
            const cachedData = JSON.parse(cachedString);
            if (cachedData.classes && cachedData.students) {
                AppState.classes = cachedData.classes;
                AppState.students = cachedData.students;
                AppState.attendances = cachedData.attendances || [];
                updateDashboardUI(); // Zero-latency render
            }
        } catch(e) {}
    } else {
        showLoader('Đang tải dữ liệu Trung tâm...');
    }

    // Luồng ngầm fetch server
    const data = await fetchGAS('loadInitialData');
    if(!cachedString) hideLoader();

    if(data) {
        AppState.classes = data.classes || [];
        AppState.students = data.students || [];
        AppState.attendances = data.attendances || [];
        
        saveToCache();
        updateDashboardUI(); // Cập nhật lại UI ngầm nếu có gì mới
    } else {
        if(!cachedString) hideLoader();
    }
}

function populateClassSelects() {
    const classOptions = AppState.classes.map(c => `<option value="${c.ClassName}">${c.ClassName}</option>`).join('');
    
    // Student Form
    const classListEl = document.getElementById('class-list');
    if (classListEl) classListEl.innerHTML = classOptions;
    
    // Student Filter
    document.getElementById('filter-class').innerHTML = '<option value="">Tất cả các lớp</option>' + classOptions;
    
    // Attendance Filter
    document.getElementById('attendance-class').innerHTML = '<option value="">-- Chọn một lớp --</option>' + classOptions;
    
    // Billing Filter
    document.getElementById('billing-class').innerHTML = '<option value="">Tất cả các lớp</option>' + classOptions;

    // --- AUTO FILL LOGIC ---
    const lastClass = localStorage.getItem('sunny_last_class');
    if (lastClass && AppState.classes.some(c => c.ClassName === lastClass)) {
        document.getElementById('attendance-class').value = lastClass;
        document.getElementById('billing-class').value = lastClass;
    }
    
    const lastMonth = localStorage.getItem('sunny_last_billing_month');
    if (lastMonth) {
        document.getElementById('billing-month').value = lastMonth;
    }
}

/* --- 4. MODULE QUẢN LÝ HỌC SINH --- */
const StudentManager = {
    openModal: () => {
        document.getElementById('student-form').reset();
        document.getElementById('student-id').value = '';
        document.getElementById('student-modal-title').innerText = 'Thêm Học sinh mới';
        document.getElementById('studentModal').classList.add('show');
    },
    closeModal: () => {
        document.getElementById('studentModal').classList.remove('show');
    },
    save: async () => {
        const btn = document.getElementById('btn-save-student');
        if (btn.disabled) return;
        btn.disabled = true;

        const id = document.getElementById('student-id').value || 'HS' + new Date().getTime();
        document.getElementById('student-id').value = id; // Khóa ID vào ô ẩn để tránh sinh ID mới nếu ấn đúp

        const student = {
            ID: id,
            Name: document.getElementById('student-name').value.trim(),
            Class: document.getElementById('student-class').value.trim(),
            DOB: document.getElementById('student-dob').value,
            EnrollDate: document.getElementById('student-enroll').value,
            Phone: document.getElementById('student-phone').value,
            Eval: document.getElementById('student-eval').value,
            Status: document.getElementById('student-status').value
        };
        
        if(!student.Name || !student.Class) {
            alert('Vui lòng nhập đủ các trường bắt buộc (*)');
            btn.disabled = false;
            return;
        }

        // Tự động kiểm tra và thêm Lớp học mới nếu chưa có
        const isClassExists = AppState.classes.some(c => c.ClassName === student.Class);
        if(!isClassExists) {
            AppState.classes.push({ ClassName: student.Class, Fee: 50000 });
            fetchGAS('saveClass', { ClassName: student.Class, Fee: 50000 }); // Chạy ngầm API lưu lớp
            document.getElementById('stat-total-classes').innerText = AppState.classes.length;
            populateClassSelects();
            renderClassSettings();
        }

        // Cập nhật giao diện TỨC THÌ (Optimistic UI) cho tốc độ SIÊU NHANH
        StudentManager.closeModal();
        const existIdx = AppState.students.findIndex(s => s.ID === student.ID);
        
        if (student.Status === 'Nghỉ học') {
            if (existIdx > -1) AppState.students.splice(existIdx, 1);
        } else {
            if(existIdx > -1) {
                AppState.students[existIdx] = student;
            } else {
                AppState.students.push(student);
            }
        }
        
        saveToCache();
        document.getElementById('stat-total-students').innerText = AppState.students.length;
        renderStudentTable();
        btn.disabled = false;

        // Đẩy lên máy chủ lưu ngầm (Không block màn hình)
        fetchGAS('saveStudent', student);
        btn.disabled = false;
    }
};

document.getElementById('btn-save-student').addEventListener('click', StudentManager.save);
document.getElementById('filter-class').addEventListener('change', renderStudentTable);

function renderStudentTable() {
    const filterClass = document.getElementById('filter-class').value;
    const body = document.getElementById('student-table-body');
    
    let filtered = AppState.students;
    if(filterClass) {
        filtered = filtered.filter(s => s.Class === filterClass);
    }
    
    if(filtered.length === 0) {
        body.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Không có học sinh nào.</td></tr>';
        return;
    }

    body.innerHTML = filtered.map(s => `
        <tr>
            <td class="font-bold text-primary">${s.ID}</td>
            <td class="font-bold">${s.Name}</td>
            <td><span class="badge badge-warning">${s.Class}</span></td>
            <td>${s.DOB || '-'}</td>
            <td>${s.Phone || '-'}</td>
            <td><span class="badge ${s.Status === 'Đang học' ? 'badge-success' : 'badge-danger'}">${s.Status}</span></td>
            <td>
                <div class="flex" style="gap: 8px;">
                    <button class="icon-btn text-secondary" title="Sửa" onclick="editStudent('${s.ID}')"><i class="fa-solid fa-pen"></i></button>
                    <button class="icon-btn text-secondary" title="Đổi trạng thái" onclick="toggleStudentStatus('${s.ID}')"><i class="fa-solid fa-box-archive"></i></button>
                    <button class="icon-btn text-danger" title="Xóa" onclick="deleteStudent('${s.ID}')"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>
        </tr>
    `).join('');
}

window.editStudent = (id) => {
    const s = AppState.students.find(x => x.ID === id);
    if(s) {
        document.getElementById('student-id').value = s.ID;
        document.getElementById('student-name').value = s.Name;
        document.getElementById('student-class').value = s.Class;
        document.getElementById('student-dob').value = s.DOB;
        document.getElementById('student-enroll').value = s.EnrollDate;
        document.getElementById('student-phone').value = s.Phone;
        document.getElementById('student-eval').value = s.Eval;
        document.getElementById('student-status').value = s.Status;
        
        document.getElementById('student-modal-title').innerText = 'Cập nhật Thông tin';
        document.getElementById('studentModal').classList.add('show');
    }
}

window.toggleStudentStatus = (id) => {
    const s = AppState.students.find(x => x.ID === id);
    if (!s) return;
    s.Status = (s.Status === 'Đang học') ? 'Nghỉ học' : 'Đang học';
    
    // Lưu tạm vào cache & cập nhật render
    saveToCache();
    renderStudentTable();
    showToast(`Đã chuyển trạng thái: ${s.Status}`, 'success');
    
    // Gọi API nền
    fetchGAS('saveStudent', s);
};

window.deleteStudent = (id) => {
    if(!confirm('Cảnh báo: Bạn có THỰC SỰ muốn xoá vĩnh viễn dữ liệu học sinh này kể cả trong Kho Lưu Trữ?')) return;
    
    const existIdx = AppState.students.findIndex(x => x.ID === id);
    if (existIdx > -1) AppState.students.splice(existIdx, 1);
    
    saveToCache();
    renderStudentTable();
    showToast('Đã xóa dữ liệu học sinh!', 'success');
    
    fetchGAS('deleteStudent', { ID: id });
};

/* --- 5. MODULE ĐIỂM DANH --- */
document.getElementById('btn-load-attendance').addEventListener('click', async () => {
    const date = document.getElementById('attendance-date').value;
    const className = document.getElementById('attendance-class').value;
    
    if(!date || !className) {
        showToast('Vui lòng chọn Ngày và Lớp để điểm danh!', 'error');
        return;
    }
    
    // Tối ưu UI: Lấy dữ liệu ngay mặt từ RAM mà KHÔNG CẦN gọi fetchGAS
    const attRecord = AppState.attendances.find(a => a.className === className && a.date === date);
    
    document.getElementById('attendance-panel').style.display = 'block';
    document.getElementById('att-class-name').innerText = className;
        
    // Mặc định tất cả Có mặt nếu chưa có dữ liệu
    const studentsInClass = AppState.students.filter(s => s.Class === className && s.Status === 'Đang học');
    const absents = attRecord ? attRecord.absents : []; 
    const lates = attRecord ? attRecord.lates : [];
        
    const tbody = document.getElementById('attendance-table-body');
    if(studentsInClass.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center">Không có học viên nào trong lớp này.</td></tr>';
            return;
        }

        tbody.innerHTML = studentsInClass.map((s, index) => {
            const isAbsent = absents.includes(s.ID);
            const isLate = lates.includes(s.ID);
            return `
            <tr data-id="${s.ID}">
                <td>${index + 1}</td>
                <td class="font-bold">${s.Name}</td>
                <td class="text-center">
                    <input type="checkbox" class="attend-toggle abs-cb" ${isAbsent ? 'checked' : ''} onchange="handleAbsentChange(this)"/>
                </td>
                <td class="text-center">
                    <input type="checkbox" class="attend-toggle late-cb" ${isLate ? 'checked' : ''} ${isAbsent ? 'disabled' : ''} />
                </td>
                <td><input type="text" class="form-control" placeholder="Ghi chú..."></td>
            </tr>
            `;
        }).join('');
});

// Hàm xử lý nếu check Vắng mặt thì disabled check Đi muộn
window.handleAbsentChange = (el) => {
    const row = el.closest('tr');
    const lateCb = row.querySelector('.late-cb');
    if (el.checked) {
        lateCb.checked = false;
        lateCb.disabled = true;
    } else {
        lateCb.disabled = false;
    }
}

document.getElementById('btn-cancel-attendance').addEventListener('click', () => {
    document.getElementById('attendance-panel').style.display = 'none';
});

document.getElementById('btn-save-attendance').addEventListener('click', async () => {
    const date = document.getElementById('attendance-date').value;
    const className = document.getElementById('attendance-class').value;
    
    const rows = document.querySelectorAll('#attendance-table-body tr[data-id]');
    const absents = [];
    const lates = [];
    
    rows.forEach(tr => {
        const id = tr.getAttribute('data-id');
        const isAbsent = tr.querySelector('.abs-cb').checked;
        const isLate = tr.querySelector('.late-cb').checked;
        if(isAbsent) absents.push(id);
        if(isLate) lates.push(id);
    });

    const payload = { date, className, absents: absents.join(','), lates: lates.join(',') };
    
    // Cập nhật giao diện đóng bảng TỨC THÌ
    document.getElementById('attendance-panel').style.display = 'none';
    document.getElementById('stat-attendance-today').innerText = 'Đã lưu (Ngầm)';
    showToast('Đã lưu dữ liệu Điểm danh dưới nền!', 'success');
    
    // Lưu vào RAM ngay lập tức
    const existIdx = AppState.attendances.findIndex(a => a.date === date && a.className === className);
    if(existIdx > -1) {
        AppState.attendances[existIdx] = { date, className, absents, lates, IDKey: date + "_" + className };
    } else {
        AppState.attendances.push({ date, className, absents, lates, IDKey: date + "_" + className });
    }
    
    saveToCache();

    // Gửi lệnh lưu lên máy chủ chạy nền
    fetchGAS('saveAttendance', payload);
});

/* --- 6. MODULE HỌC PHÍ & BÁO CÁO --- */
document.getElementById('btn-generate-report').addEventListener('click', async () => {
    const month = document.getElementById('billing-month').value; // YYYY-MM
    const classNameFilter = document.getElementById('billing-class').value;
    
    if(!month) {
        showToast('Vui lòng chọn Tháng tổng kết!', 'error');
        return;
    }
    
    // TỐI ƯU SIÊU TỐC ĐỘ: Tính toán logic lập tức trên RAM
    const bills = generateBillingOffline(month, classNameFilter);

    document.getElementById('billing-panel').style.display = 'block';
    document.getElementById('bill-month-label').innerText = month;
    
    const tbody = document.getElementById('billing-table-body');
    
    if(bills.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">Chưa có dữ liệu nào cho tháng này.</td></tr>';
        document.getElementById('billing-grand-total').innerText = '0 ₫';
        return;
    }

    let grandTotal = 0;
    tbody.innerHTML = bills.map(b => {
        grandTotal += b.totalFee;
            return `
            <tr>
                <td class="text-muted">${b.studentId}</td>
                <td class="font-bold">${b.studentName}</td>
                <td><span class="badge badge-warning">${b.className}</span></td>
                <td class="text-center">${new Intl.NumberFormat('vi-VN').format(b.feePerSession)} đ</td>
                <td class="text-center font-bold text-success">${b.attendedSessions}</td>
                <td class="text-center text-danger">${b.absentSessions}</td>
                <td class="text-right font-bold text-primary">${new Intl.NumberFormat('vi-VN').format(b.totalFee)} ₫</td>
            </tr>
            `;
        }).join('');
        
        document.getElementById('billing-grand-total').innerText = new Intl.NumberFormat('vi-VN').format(grandTotal) + ' ₫';
});

// Hàm tính tiền học từ dữ liệu lưu trong bộ nhớ tạm (Cực Nhanh 0s)
function generateBillingOffline(monthStr, classFilter) {
    const classFeeMap = {};
    AppState.classes.forEach(c => classFeeMap[c.ClassName] = c.Fee);
    
    const attRecordsInMonth = AppState.attendances.filter(a => String(a.date).startsWith(monthStr));
    
    // Hash map đếm số buổi của Lớp, và số buổi Vắng của từng Học sinh
    const classTotalSessions = {};
    const studentAbsentCounts = {};
    
    attRecordsInMonth.forEach(rec => {
        if(!classTotalSessions[rec.className]) classTotalSessions[rec.className] = 0;
        classTotalSessions[rec.className]++;
        
        // rec.absents lưu dạng chuỗi "ID1,ID2"
        if(rec.absents && typeof rec.absents === 'string') {
            rec.absents.split(',').forEach(id => {
                if(id) {
                    studentAbsentCounts[id] = (studentAbsentCounts[id] || 0) + 1;
                }
            });
        }
    });

    const bills = [];
    AppState.students.forEach(s => {
        if(s.Status !== 'Đang học' && s.Status !== 'Bảo lưu') return;
        if(classFilter && s.Class !== classFilter) return;
        
        const sClass = s.Class;
        const totalClassSess = classTotalSessions[sClass] || 0;
        if (totalClassSess === 0) return;
        
        const absentCount = studentAbsentCounts[s.ID] || 0;
        const attendedCount = totalClassSess - absentCount;
        const feePerSess = classFeeMap[sClass] || 50000;
        // Logic tính toán: Nếu vắng (không học) thì không đóng tiền -> Chỉ tính các buổi có đi học
        const totalFee = attendedCount * feePerSess;
        
        bills.push({
            studentId: s.ID, studentName: s.Name, className: sClass, feePerSession: feePerSess,
            totalClassSessions: totalClassSess, absentSessions: absentCount,
            attendedSessions: attendedCount, totalFee: totalFee
        });
    });
    return bills;
}

/* --- 7. MODULE SETTING LỚP HỌC --- */
function renderClassSettings() {
    const tbody = document.getElementById('class-settings-body');
    if(AppState.classes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center">Chưa có lớp nào</td></tr>';
        return;
    }
    
    tbody.innerHTML = AppState.classes.map(c => `
        <tr>
            <td class="font-bold">${c.ClassName}</td>
            <td><input type="number" class="form-control w-50" value="${c.Fee}" id="fee-${c.ClassName}" style="width:150px"></td>
            <td>
                <button class="btn btn-secondary" onclick="updateClassFee('${c.ClassName}')">Cập nhật</button>
            </td>
        </tr>
    `).join('');
}

document.getElementById('btn-add-class').addEventListener('click', () => {
    const className = document.getElementById('new-class-name').value.trim();
    if(className) {
        document.getElementById('new-class-name').value = '';
        
        // Render UI lập tức
        AppState.classes.push({ ClassName: className, Fee: 50000 });
        saveToCache();
        document.getElementById('stat-total-classes').innerText = AppState.classes.length;
        populateClassSelects();
        renderClassSettings();
        
        // Bắn API chạy ngầm
        fetchGAS('saveClass', { ClassName: className, Fee: 50000 });
    }
});

window.updateClassFee = (className) => {
    const feeInfo = document.getElementById(`fee-${className}`).value;
    
    // Tối ưu Tốc độ: Render UI tức thì
    const cls = AppState.classes.find(c => c.ClassName === className);
    if(cls) {
        cls.Fee = Number(feeInfo);
        saveToCache();
    }
    renderClassSettings();
    
    // Lưu chạy ngầm
    fetchGAS('saveClass', { ClassName: className, Fee: Number(feeInfo) });
};

// Auto Set Today for Attendance Date input
document.getElementById('attendance-date').valueAsDate = new Date();
