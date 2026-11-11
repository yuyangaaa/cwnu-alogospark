#include <bits/stdc++.h>
using namespace std;
struct Student {
    string name;
    int score[3];
};
int totalScore(const Student &student) {
    return student.score[0] + student.score[1] + student.score[2];
}
int main() {
    int n;
    cin >> n;
    vector<Student> students(n);
    for (Student &student : students) {
        cin >> student.name >> student.score[0] >> student.score[1] >> student.score[2];
    }
    int best = 0;
    for (int i = 1; i < n; i++) {
        if (totalScore(students[i]) > totalScore(students[best])) best = i;
    }
    cout << students[best].name << ' ' << totalScore(students[best]) << '\n';
}
