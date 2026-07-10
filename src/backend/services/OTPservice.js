const OTP_STORE = new Map();

const generateOTP = () => {
  return Math.floor(Math.random() * 100000).toString().padStart(5, '0');
};

const getOTP = (email)=>{
    return OTP_STORE?.get(email)
}

const setOTP = (email,password) => {
    const expTime = Date.now() + 0.5 * 60 * 1000;
    const otp = generateOTP();
    OTP_STORE?.set(email,{
        otp,
        expTime,
        verified:false,
        hashedPassword:password,
        email
    });
    return otp;
}


const updateOTP = (email,obj) => {
    if (OTP_STORE?.has(email)) {
        OTP_STORE?.set(email,obj)
    }
}

const deleteOTP = (email)=>{
    OTP_STORE?.delete(email);
    return null
}


export {getOTP,setOTP,deleteOTP,updateOTP};




