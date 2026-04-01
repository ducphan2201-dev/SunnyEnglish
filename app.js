/**
 * TÊN DỰ ÁN: Cổng Quản Lý SunnyEnglish
 * MÔ TẢ: File xử lý Logic Giao diện và API Fetch tới Google Apps Script
 */

const AppState = {
    apiUrl: (typeof CONFIG !== 'undefined' && CONFIG.GAS_URL) ? CONFIG.GAS_URL : (localStorage.getItem('GAS_URL') || ''),
    classes: [],
    students: [],
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

function setupNavigation() {
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

/* --- 2. API REQUEST WRAPPER --- */

async function fetchGAS(action, payload = {}) {
    if(!AppState.apiUrl) return null;
    try {
        const response = await fetch(AppState.apiUrl, {
            method: 'POST',
            body: JSON.stringify({ action: action, data: payload }),
            // text/plain prevents CORS preflight OPTIONS request
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        const result = await response.json();
        if(result.status === 'success') {
            return result.data;
        } else {
            console.error('GAS Error:', result.message);
            alert('Lỗi: ' + result.message);
            return null;
        }
    } catch(err) {
        console.error('Fetch Error:', err);
        alert('Hệ thống bị chặn kết nối tới dữ liệu máy chủ!\n\nLỗi chi tiết: ' + err.name + ' - ' + err.message + '\n\nNguyên nhân 99%: Do trình duyệt của bạn đang bật Tiện ích chặn quảng cáo (Adblock) hoặc dùng trình duyệt đặc biệt (Brave) hoặc Safari đang bật "Chống theo dõi trang web" nên nó chặn kho cờ sở dữ liệu gốc của Google.\n\nCách xử lý: \n=> HÃY TẮT CÁC PHẦN MỀM CHẶN QUẢNG CÁO CHO TRANG NÀY RỒI F5 LẠI!');
        return null;
    }
}

/* --- 3. INIT DATA LOAD --- */
async function loadInitialData() {
    showLoader('Đang tải dữ liệu Trung tâm...');
    const data = await fetchGAS('loadInitialData');
    hideLoader();

    if(data) {
        AppState.classes = data.classes || [];
        AppState.students = data.students || [];
        
        // Update Dashboard
        document.getElementById('stat-total-students').innerText = AppState.students.length;
        document.getElementById('stat-total-classes').innerText = AppState.classes.length;
        document.getElementById('system-status').innerHTML = '✅ Kết nối máy chủ thành công. Hệ thống sẵn sàng!';
        document.getElementById('system-status').className = 'alert badge-success mt-2';
        
        populateClassSelects();
        renderStudentTable();
        renderClassSettings();
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
        if(existIdx > -1) {
            AppState.students[existIdx] = student;
        } else {
            AppState.students.push(student);
        }
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
                <button class="icon-btn text-secondary" title="Sửa" onclick="editStudent('${s.ID}')"><i class="fa-solid fa-pen"></i></button>
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

/* --- 5. MODULE ĐIỂM DANH --- */
document.getElementById('btn-load-attendance').addEventListener('click', async () => {
    const date = document.getElementById('attendance-date').value;
    const className = document.getElementById('attendance-class').value;
    
    if(!date || !className) {
        alert('Vui lòng chọn Ngày và Lớp để điểm danh!');
        return;
    }
    
    showLoader('Đang nạp danh sách điểm danh...');
    const data = await fetchGAS('getAttendance', { date, className });
    hideLoader();
    
    if(data) {
        document.getElementById('attendance-panel').style.display = 'block';
        document.getElementById('att-class-name').innerText = className;
        
        // Mặc định tất cả Có mặt nếu chưa có dữ liệu. Data trả về danh sách vắng/muộn nếu có.
        const studentsInClass = AppState.students.filter(s => s.Class === className && s.Status === 'Đang học');
        const absents = data.absents || []; // Array of IDs
        const lates = data.lates || [];     // Array of IDs
        
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
                <td><input type="text" class="form-control" style="padding:0.25rem" placeholder="Ghi chú..."></td>
            </tr>
            `;
        }).join('');
    }
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
    
    // Gửi lệnh lưu lên máy chủ chạy nền
    fetchGAS('saveAttendance', payload);
});

/* --- 6. MODULE HỌC PHÍ & BÁO CÁO --- */
document.getElementById('btn-generate-report').addEventListener('click', async () => {
    const month = document.getElementById('billing-month').value; // YYYY-MM
    const classNameFilter = document.getElementById('billing-class').value;
    
    if(!month) {
        alert('Vui lòng chọn Tháng tổng kết!');
        return;
    }
    
    showLoader(`Đang tính toán học phí tháng ${month}...`);
    const data = await fetchGAS('generateBilling', { month, className: classNameFilter });
    hideLoader();

    if(data) {
        document.getElementById('billing-panel').style.display = 'block';
        document.getElementById('bill-month-label').innerText = month;
        
        const tbody = document.getElementById('billing-table-body');
        
        if(data.bills.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">Chưa có dữ liệu nào cho tháng này.</td></tr>';
            document.getElementById('billing-grand-total').innerText = '0 ₫';
            return;
        }

        let grandTotal = 0;
        tbody.innerHTML = data.bills.map(b => {
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
    }
});

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
    if(cls) cls.Fee = Number(feeInfo);
    renderClassSettings();
    
    // Lưu chạy ngầm
    fetchGAS('saveClass', { ClassName: className, Fee: Number(feeInfo) });
};

// Auto Set Today for Attendance Date input
document.getElementById('attendance-date').valueAsDate = new Date();
