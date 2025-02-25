export const fetchData = () => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            resolve({ msg: "success" });
        }, 1000);
    });
};