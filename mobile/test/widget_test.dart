import 'package:cl3_access/main.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('shows the controller and phone access controls', (tester) async {
    await tester.pumpWidget(const Cl3AccessApp());

    expect(find.text('CL3 Smart Access'), findsOneWidget);
    expect(find.text('Controller disconnected'), findsOneWidget);
    expect(find.text('Scan and connect'), findsOneWidget);
    expect(find.text('Biometric unlock'), findsOneWidget);
  });
}
