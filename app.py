import streamlit as st
import google.generativeai as genai
import PyPDF2
import io

# 1. Cấu hình giao diện
st.set_page_config(page_title="VinaPod Studio", page_icon="🎙️")
st.title("🎙️ VinaPod Studio - Podcast Creator")

# 2. Kết nối API (Lấy từ Secrets của Streamlit)
try:
    API_KEY = st.secrets["GEMINI_API_KEY"]
    genai.configure(api_key=API_KEY)
except:
    st.error("Chưa cấu hình API Key trong Secrets!")

# 3. Sidebar - Cấu hình nhân vật
with st.sidebar:
    st.header("Cấu hình Podcast")
    host_name = st.text_input("Tên Host (Nam)", "Minh")
    guest_name = st.text_input("Tên Phản biện (Nữ)", "An")
    personality = st.select_slider("Mức độ phản biện của An", 
                                   options=["Nhẹ nhàng", "Thắc mắc", "Bắt bẻ", "Lươn lẹo"])

# 4. Giao diện chính
uploaded_file = st.file_uploader("Tải lên tài liệu PDF", type="pdf")
ep_number = st.number_input("Tập số:", min_value=1, value=1)
old_log = st.text_area("Podcast Log (Dán kết thúc tập trước vào đây để nối mạch):")

if st.button("Tạo Kịch Bản"):
    if uploaded_file is not None:
        # Đọc nội dung PDF
        pdf_reader = PyPDF2.PdfReader(uploaded_file)
        text_content = ""
        for page in pdf_reader.pages:
            text_content += page.extract_text()

        # Cấu hình AI
        model = genai.GenerativeModel('gemini-1.5-flash')
        
        # System Instruction (Đưa yêu cầu của bạn vào đây)
        prompt = f"""
        Bạn là biên kịch Podcast chuyên nghiệp. Hãy viết kịch bản Tập {ep_number} dựa trên tài liệu được cung cấp.
        
        NHÂN VẬT:
        - {host_name}: Giọng Nam, thông tuệ, điềm đạm.
        - {guest_name}: Giọng Nữ, phong cách {personality}. Thích bẻ lái, bắt bẻ từ ngữ lươn lẹo để làm rõ vấn đề.
        
        YÊU CẦU:
        1. Chỉ sử dụng tiếng Việt chuẩn, không sai chính tả.
        2. Thời lượng kịch bản khoảng 1500-2000 từ để đảm bảo đọc từ 5-10 phút.
        3. Phân tích sâu, không nói nông cạn.
        4. Bối cảnh tập này phải tiếp nối Log sau: {old_log}
        
        TÀI LIỆU GỐC: {text_content[:10000]} # Giới hạn 10k ký tự để tránh lỗi tràn bộ nhớ bản free
        """

        with st.spinner("Đang biên kịch..."):
            response = model.generate_content(prompt)
            st.subheader(f"Kịch bản Tập {ep_number}")
            st.markdown(response.text)
            
            # Tạo Log tự động cho tập sau
            st.info("💡 Mẹo: Hãy copy đoạn kịch bản trên dán vào tập sau để giữ tính xuyên suốt.")
    else:
        st.warning("Vui lòng upload tài liệu!")
